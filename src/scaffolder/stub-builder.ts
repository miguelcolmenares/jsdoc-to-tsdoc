/**
 * Rendering of TSDoc stub comments for undocumented exports.
 *
 * @remarks
 * One template per {@link ExportKind}, chosen by {@link buildStub}. Every stub
 * carries a `TODO(tsdoc)` marker so a developer can `grep 'TODO(tsdoc)'` to find
 * everything the deterministic inference guessed at, exactly as specified in the
 * project plan.
 *
 * Stubs are rendered as comment lines and indented to match the declaration they
 * document, so inserting one never disturbs surrounding code layout.
 *
 * @since 0.1.0
 */

import {
  inferComponentSummary,
  inferFunctionSummary,
  inferGroupSummary,
  inferHookSummary,
  inferNounSummary,
} from "@/scaffolder/name-inference";
import type { ExportedDeclaration, ExportParameter } from "@/scanner";

/**
 * The marker appended to every generated stub, so inferred prose can be found
 * and reviewed with a single grep.
 */
export const TODO_MARKER = "TODO(tsdoc): verify this generated summary.";

/**
 * Builds the `@param` lines for a function-like declaration.
 *
 * @param parameters - The declaration's parameters.
 * @returns One `@param` line per parameter, in source order.
 */
function paramLines(
  parameters: readonly ExportParameter[],
): readonly string[] {
  return parameters.map((parameter) => {
    const optional = parameter.isOptional ? " (optional)" : "";
    return `@param ${parameter.name} - TODO(tsdoc): describe ${parameter.name}${optional}.`;
  });
}

/**
 * Builds the `@typeParam` lines for a generic declaration.
 *
 * @param typeParameters - The declaration's type-parameter names.
 * @returns One `@typeParam` line per type parameter.
 */
function typeParamLines(
  typeParameters: readonly string[],
): readonly string[] {
  return typeParameters.map(
    (name) => `@typeParam ${name} - TODO(tsdoc): describe ${name}.`,
  );
}

/**
 * Selects the summary sentence for a declaration.
 *
 * @param declaration - The export being documented.
 * @returns The inferred one-line summary.
 */
function summaryFor(declaration: ExportedDeclaration): string {
  const { kind, name, names } = declaration;

  // A statement binding several names has one comment position, so the summary
  // must name every binding instead of only the first.
  if (names.length > 1) {
    return inferGroupSummary(names);
  }

  // An anonymous default export has no identifier to infer prose from.
  if (name === "default") {
    return kind === "react-component"
      ? "Renders the default export."
      : "Default export.";
  }

  switch (kind) {
    case "react-component":
      return inferComponentSummary(name);
    case "hook":
      return inferHookSummary(name);
    case "server-action":
      return `Server Action. ${inferFunctionSummary(name)}`;
    case "function":
      return inferFunctionSummary(name);
    case "interface":
    case "type-alias":
    case "class":
    case "enum":
    case "variable":
      return inferNounSummary(name);
  }
}

/**
 * Builds the tag lines (everything after the summary) for a declaration.
 *
 * @param declaration - The export being documented.
 * @returns The tag lines, without the surrounding comment scaffolding.
 */
function tagLinesFor(declaration: ExportedDeclaration): readonly string[] {
  const lines: string[] = [
    ...typeParamLines(declaration.typeParameters),
    ...paramLines(declaration.parameters),
  ];

  const isFunctionLike =
    declaration.kind === "function" ||
    declaration.kind === "hook" ||
    declaration.kind === "server-action" ||
    declaration.kind === "react-component";

  if (isFunctionLike && declaration.hasReturnValue) {
    lines.push("@returns TODO(tsdoc): describe the return value.");
  }

  return lines;
}

/**
 * Renders a TSDoc comment block from its summary and tag lines.
 *
 * @remarks
 * Tag order follows the TSDoc structure convention: summary paragraph, then
 * `@remarks`, then `@typeParam` / `@param`, then `@returns`. The review marker
 * therefore sits in `@remarks` directly beneath the summary it qualifies.
 *
 * @param summary - The first paragraph of the comment.
 * @param tagLines - The block tags that follow the summary.
 * @param indent - Leading whitespace to align the comment with its declaration.
 * @returns The full comment block, newline-terminated so it can be spliced
 * directly above the declaration.
 */
function renderComment(
  summary: string,
  tagLines: readonly string[],
  indent: string,
): string {
  const body: string[] = [
    `${indent}/**`,
    `${indent} * ${summary}`,
    `${indent} *`,
    `${indent} * @remarks ${TODO_MARKER}`,
  ];

  if (tagLines.length > 0) {
    body.push(`${indent} *`);
    for (const line of tagLines) {
      body.push(`${indent} * ${line}`);
    }
  }

  body.push(`${indent} */`);
  return `${body.join("\n")}\n`;
}

/**
 * Builds the TSDoc stub comment for one undocumented export.
 *
 * @param declaration - The export to document.
 * @returns The comment block, indented and newline-terminated, ready to insert
 * at the declaration's {@link ExportedDeclaration.insertPos}.
 *
 * @example
 * The stub for `submitContactForm(prevState, formData): Promise<State>` — one
 * `@param` per declared parameter, and `@returns` because the action resolves
 * to a value:
 *
 * ```typescript
 * buildStub(submitContactForm);
 * // "/**\n"
 * // " * Server Action. Submits the contact form.\n"
 * // " *\n"
 * // " * @remarks TODO(tsdoc): verify this generated summary.\n"
 * // " *\n"
 * // " * @param prevState - TODO(tsdoc): describe prevState.\n"
 * // " * @param formData - TODO(tsdoc): describe formData.\n"
 * // " * @returns TODO(tsdoc): describe the return value.\n"
 * // " *\/\n"
 * ```
 */
export function buildStub(declaration: ExportedDeclaration): string {
  const comment = renderComment(
    summaryFor(declaration),
    tagLinesFor(declaration),
    declaration.indent,
  );

  if (declaration.ownsLine) {
    return comment;
  }

  // The declaration shares its line with earlier code. A comment that opens on
  // that same line is parsed as the earlier statement's trailing comment, so the
  // stub starts a fresh line; the trailing indent then carries the declaration
  // itself over at the surrounding indentation instead of column 0.
  return `\n${comment}${declaration.indent}`;
}
