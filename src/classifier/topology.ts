/**
 * Classification of how well each export is documented, and how much of that
 * documentation can be trusted.
 *
 * @remarks
 * The other domains ask "what would change?". This one asks "what is there, and
 * what should the user do about it?" — the question that decides whether a repo
 * is ready for `convert`, needs `scaffold`, or needs a human.
 *
 * Everything here is deliberately conservative. A classification that
 * over-reports is worse than one that stays quiet: the whole point is to tell
 * someone where to spend their attention, and a report crying wolf about
 * accurate documentation gets ignored, taking the true findings with it.
 *
 * @since 0.1.0
 */

import {
  getCommentTags,
  getDocumentedParams,
  getDocumentedTypeParams,
} from "@/parser";
import {
  isFunctionLikeKind,
  type ExportedDeclaration,
  type ExportKind,
} from "@/scanner";

/**
 * How an export is documented.
 *
 * - `valid` — a doc comment that covers what the signature declares.
 * - `partial` — a doc comment that leaves part of the signature undocumented.
 * - `line-comments` — no doc comment, but `//` prose a human wrote.
 * - `no-docs` — nothing, or a plain `/* *\/` block that documents nothing.
 * - `stale` — a doc comment that contradicts the signature.
 */
export type Topology =
  "valid" | "partial" | "line-comments" | "no-docs" | "stale";

/**
 * How much the documentation can be trusted, which decides the recommended
 * action.
 */
export type Confidence = "high" | "medium" | "low" | "stale";

/** The verdict for one exported declaration. */
export interface DeclarationClassification {
  /** The exported symbol name. */
  readonly name: string;
  /** 1-based line of the declaration. */
  readonly line: number;
  /** What kind of export it is. */
  readonly kind: ExportKind;
  /** How it is documented. */
  readonly topology: Topology;
  /** What the signature declares but the comment does not document. */
  readonly gaps: readonly string[];
  /** What the comment documents but the signature does not declare. */
  readonly stale: readonly string[];
}

const CONFIDENCE_BY_TOPOLOGY: Readonly<Record<Topology, Confidence>> =
  Object.freeze({
    valid: "high",
    partial: "medium",
    "line-comments": "low",
    "no-docs": "low",
    stale: "stale",
  });

/**
 * Maps a topology to the confidence level that drives the recommended action.
 *
 * @param topology - The classification result.
 * @returns The confidence level.
 */
export function confidenceOf(topology: Topology): Confidence {
  return CONFIDENCE_BY_TOPOLOGY[topology];
}

/**
 * The root of a documented parameter path.
 *
 * @remarks
 * JSDoc documents a member of an object parameter as `options.name`. The
 * signature only ever declares `options`, so the root is what can be compared.
 *
 * @param documented - The documented name, possibly dotted.
 * @returns The portion before the first dot.
 */
function rootOf(documented: string): string {
  return documented.split(".")[0] ?? documented;
}

/**
 * Finds documentation that contradicts a function-like signature.
 *
 * @remarks
 * A destructured parameter has no name in the source, so the scanner invents
 * one (`props`, `options`, `arg1`). Documentation for such a signature may
 * legitimately describe either that stand-in or the individual destructured
 * members, and there is no way to tell an accurate `@param title` from a stale
 * one. Rather than guess, parameter staleness is not reported at all for those
 * declarations — the alternative would flag correct documentation on nearly
 * every React component, which is the most common shape in the codebases this
 * tool was built for.
 *
 * A signature that could not be read at all is likewise never judged. A hook
 * recognized by its name but built by a factory or bound to an alias
 * (`export const useHash = createHook(defaults);`) reports no parameters, and
 * treating that as "declares none" turned every `@param` on it into a
 * contradiction. "Nothing was read" and "nothing is declared" are different
 * facts, and only the second is evidence.
 *
 * Type parameters carry no such ambiguity, so they are always checked.
 *
 * @param declaration - The export being classified.
 * @param comment - Its doc comment text.
 * @returns One message per contradiction, empty when none is provable.
 */
function findStale(
  declaration: ExportedDeclaration,
  comment: string,
): readonly string[] {
  const stale: string[] = [];

  const declaredTypeParams = new Set(declaration.typeParameters);
  for (const documented of getDocumentedTypeParams(comment)) {
    if (!declaredTypeParams.has(documented)) {
      stale.push(
        `@typeParam '${documented}' is not declared by ${declaration.name}` +
          describeDeclared(declaration.typeParameters),
      );
    }
  }

  if (!isFunctionLikeKind(declaration.kind) || !declaration.hasSignature) {
    return stale;
  }

  const destructured = declaration.parameters.some(
    (parameter) => parameter.isSynthesized,
  );
  if (destructured) {
    return stale;
  }

  const declared = new Set(
    declaration.parameters.map((parameter) => parameter.name),
  );
  for (const documented of getDocumentedParams(comment)) {
    if (!declared.has(rootOf(documented))) {
      stale.push(
        `@param '${documented}' is not a parameter of ${declaration.name}` +
          describeDeclared(declaration.parameters.map((p) => p.name)),
      );
    }
  }

  return stale;
}

/**
 * Renders the "found: …" suffix naming what the signature actually declares.
 *
 * @param declared - The names the signature declares.
 * @returns A parenthesised list, or a note that it declares none.
 */
function describeDeclared(declared: readonly string[]): string {
  return declared.length === 0
    ? " (it declares none)"
    : ` (found: ${declared.join(", ")})`;
}

/**
 * Finds parts of a signature the comment leaves undocumented.
 *
 * @remarks
 * A destructured parameter suspends the check, as it does for staleness — but
 * only once the comment documents *some* parameter, since a comment documenting
 * none is incomplete either way.
 *
 * React components are exempt from `@param` and `@returns` entirely. A
 * component returns JSX by definition, and its props are described by the
 * `Props` interface it accepts rather than repeated as tags. Measured on the
 * three migrations this tool was built from, only 7 of 44 hand-reviewed
 * component files document `@returns` — so requiring it turned three quarters
 * of every real component into a reported gap, against codebases whose own
 * lint passes. It is the same reason the recommended ESLint config keeps
 * `require-param` and `require-returns` off.
 *
 * This is a deliberate divergence from `scaffold`, which does emit both tags
 * for a component. Generating a placeholder for a human to fill in is a
 * different act from declaring hand-written prose incomplete.
 *
 * @param declaration - The export being classified.
 * @param comment - Its doc comment text.
 * @returns One message per gap.
 */
function findGaps(
  declaration: ExportedDeclaration,
  comment: string,
): readonly string[] {
  const gaps: string[] = [];

  const documentedTypeParams = new Set(getDocumentedTypeParams(comment));
  for (const declared of declaration.typeParameters) {
    if (!documentedTypeParams.has(declared)) {
      gaps.push(`@typeParam ${declared} is not documented`);
    }
  }

  if (
    !isFunctionLikeKind(declaration.kind) ||
    declaration.kind === "react-component"
  ) {
    return gaps;
  }

  const documentedParams = getDocumentedParams(comment);
  const documented = new Set(documentedParams.map(rootOf));
  const destructured = declaration.parameters.some(
    (parameter) => parameter.isSynthesized,
  );

  if (!destructured || documentedParams.length === 0) {
    for (const parameter of declaration.parameters) {
      if (!documented.has(parameter.name)) {
        gaps.push(`@param ${parameter.name} is not documented`);
      }
    }
  }

  // Read through the fence-aware tag reader rather than a regex over the whole
  // comment: an `@returns` shown inside an `@example` is sample text, and
  // letting it answer the question would hide a real gap. `getCommentTags`
  // rather than `getBlockTags`, because on a single-line comment every tag but
  // the first opens no line of its own.
  const tags = new Set(getCommentTags(comment));
  if (
    declaration.hasReturnValue &&
    !tags.has("@returns") &&
    !tags.has("@return")
  ) {
    gaps.push("@returns is not documented");
  }

  return gaps;
}

/**
 * Classifies how one exported declaration is documented.
 *
 * @param declaration - The export to classify.
 * @returns Its {@link DeclarationClassification}.
 */
export function classifyDeclaration(
  declaration: ExportedDeclaration,
): DeclarationClassification {
  const base = {
    name: declaration.name,
    line: declaration.line,
    kind: declaration.kind,
  };

  const { comment } = declaration;
  if (
    comment === undefined ||
    comment.kind === "block" ||
    comment.kind === "directive"
  ) {
    return { ...base, topology: "no-docs", gaps: [], stale: [] };
  }
  if (comment.kind === "line") {
    return { ...base, topology: "line-comments", gaps: [], stale: [] };
  }

  const stale = findStale(declaration, comment.text);
  if (stale.length > 0) {
    return { ...base, topology: "stale", gaps: [], stale };
  }

  const gaps = findGaps(declaration, comment.text);
  return {
    ...base,
    topology: gaps.length > 0 ? "partial" : "valid",
    gaps,
    stale: [],
  };
}
