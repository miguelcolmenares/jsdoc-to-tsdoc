/**
 * Enumeration of a source file's exported declarations and whether each already
 * carries a TSDoc comment.
 *
 * @remarks
 * `scaffold` needs three facts per export: where to insert a stub, what shape the
 * export is (so the right template applies), and whether a doc comment is already
 * present. All three come from the TypeScript compiler API rather than regular
 * expressions, so `export` keywords inside strings, template literals, or nested
 * scopes are never mistaken for real declarations.
 *
 * This module resolves *how* a declaration reaches the module surface; the shape
 * of each declaration comes from `declaration-shape`, and the stub position from
 * `insertion-location`.
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

import { isExported, type ExportKind, type ExportParameter } from "@/scanner/declaration-classifier";
import {
  describeDefaultExport,
  describeStatement,
  type DeclarationShape,
} from "@/scanner/declaration-shape";
import {
  locateInsertion,
  readLeadingComment,
  type LeadingComment,
} from "@/scanner/insertion-location";

export type { ExportKind, ExportParameter, LeadingComment };

/**
 * An exported declaration discovered in a source file.
 */
export interface ExportedDeclaration {
  /** The exported symbol name (`"default"` for an anonymous default export). */
  readonly name: string;
  /**
   * Every name the declaration exports. Longer than one entry only for a
   * variable statement that binds several names (`export const A = 1, B = 2;`
   * or `export const { a, b } = source;`), which has a single comment position
   * and is therefore documented as one unit.
   */
  readonly names: readonly string[];
  /** The declaration shape, used to pick a template. */
  readonly kind: ExportKind;
  /** Whether a `/** *\/` doc comment is already attached. */
  readonly hasDocComment: boolean;
  /**
   * The comment attached to the declaration, whatever its kind, or `undefined`
   * when nothing is attached.
   *
   * @remarks
   * {@link ExportedDeclaration.hasDocComment} answers the only question
   * `scaffold` asks. Classification needs more: the text of a doc comment, to
   * compare its tags against the signature, and the presence of `//` prose,
   * which is documentation a human wrote even though TSDoc does not see it.
   */
  readonly comment: LeadingComment | undefined;
  /** Offset at which a doc comment for this declaration should be inserted. */
  readonly insertPos: number;
  /**
   * Offset at which the replaced span ends. Equal to {@link insertPos} for the
   * usual zero-width insertion; when another statement shares the line it spans
   * the spaces or tabs separating the two, so moving the declaration onto its
   * own line does not strand them as trailing whitespace.
   */
  readonly insertEnd: number;
  /** Indentation (leading whitespace) of the declaration's line. */
  readonly indent: string;
  /**
   * Whether the declaration is the first thing on its line. When `false`
   * another statement precedes it on the same line, so a stub must open on a
   * fresh line: TypeScript treats a comment that starts on the same line as
   * preceding code as a *trailing* comment of that earlier statement, which
   * would leave this declaration looking undocumented.
   */
  readonly ownsLine: boolean;
  /** 1-based line number of the declaration, for reporting. */
  readonly line: number;
  /** Parameters, when the declaration is function-like. */
  readonly parameters: readonly ExportParameter[];
  /** Type-parameter names, when the declaration is generic. */
  readonly typeParameters: readonly string[];
  /** Whether the declaration returns a value (drives whether to emit `@returns`). */
  readonly hasReturnValue: boolean;
  /**
   * Whether {@link ExportedDeclaration.parameters} was read from a callable
   * node, rather than left empty because no signature was reachable.
   */
  readonly hasSignature: boolean;
}

/**
 * Enumerates every exported declaration in a source file.
 *
 * @remarks
 * Only top-level statements are considered — an export nested inside a namespace
 * or a block is not part of the module's public surface for scaffolding
 * purposes.
 *
 * Four export forms are recognized: a declaration carrying the `export`
 * modifier, a local declaration named by a later `export { … }` list, a local
 * declaration named by `export default …`, and an anonymous function or arrow
 * exported directly as the default. For the two that name a local declaration
 * the stub is attached to that declaration, which is where the documentation
 * belongs and which keeps a second run idempotent; the anonymous default has no
 * such home, so the export statement itself carries it.
 *
 * Re-exports that name another module (`export { x } from …`, `export * from …`)
 * are skipped because the symbol is documented where it is defined; the same
 * applies to an `export { x }` whose `x` is an imported binding rather than a
 * local declaration.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name, used to pick the TS/TSX dialect.
 * @returns The exported declarations in source order.
 */
export function collectExportedDeclarations(
  sourceText: string,
  fileName: string,
): readonly ExportedDeclaration[] {
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );

  const results: ExportedDeclaration[] = [];
  // One name can map to several statements: an overload set contributes a
  // declaration per signature plus the implementation, and declaration merging
  // pairs (an interface and a function of the same name) contribute two. Each
  // needs its own comment, so an export list has to mark them all.
  const localsByName = new Map<string, ts.Statement[]>();
  const recorded = new Set<ts.Statement>();

  const record = (statement: ts.Statement, shape: DeclarationShape): void => {
    if (recorded.has(statement)) {
      return;
    }
    recorded.add(statement);
    const { insertPos, insertEnd, indent, line, ownsLine } = locateInsertion(
      sourceFile,
      statement,
    );
    const comment = readLeadingComment(sourceFile, statement);
    results.push({
      name: shape.name,
      names: shape.names,
      kind: shape.kind,
      hasDocComment: comment?.kind === "doc",
      comment,
      insertPos,
      insertEnd,
      indent,
      line,
      ownsLine,
      parameters: shape.parameters,
      typeParameters: shape.typeParameters,
      hasReturnValue: shape.hasReturnValue,
      hasSignature: shape.hasSignature,
    });
  };

  // Pass 1 — declarations carrying the `export` modifier. Everything else that
  // could be documented is indexed by name so a later `export { … }` list or
  // `export default …` can resolve back to it.
  for (const statement of sourceFile.statements) {
    const shape = describeStatement(statement);
    if (shape === undefined) {
      continue;
    }
    if (isExported(statement)) {
      record(statement, shape);
      continue;
    }
    for (const name of shape.names) {
      const declared = localsByName.get(name);
      if (declared === undefined) {
        localsByName.set(name, [statement]);
      } else {
        declared.push(statement);
      }
    }
  }

  // Pass 2 — exports expressed as statements over local declarations. Names are
  // accumulated per target statement first, because one statement can bind
  // several names while an export list publishes only some of them; the record
  // must describe exactly the exported subset.
  const exportedNamesByStatement = new Map<ts.Statement, Set<string>>();

  const noteExported = (name: string): void => {
    const targets = localsByName.get(name);
    if (targets === undefined) {
      return;
    }
    // Every statement contributing this name is published by the export, so
    // each one needs its own comment.
    for (const target of targets) {
      const names = exportedNamesByStatement.get(target);
      if (names === undefined) {
        exportedNamesByStatement.set(target, new Set([name]));
        continue;
      }
      names.add(name);
    }
  };

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      // `export … from "./x"` re-exports another module: documented there.
      if (statement.moduleSpecifier !== undefined) {
        continue;
      }
      const clause = statement.exportClause;
      if (clause === undefined || !ts.isNamedExports(clause)) {
        continue;
      }
      for (const specifier of clause.elements) {
        // `export { local as public }` documents `local`.
        noteExported((specifier.propertyName ?? specifier.name).text);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) {
        noteExported(statement.expression.text);
        continue;
      }
      // An anonymous default-exported function has no local declaration to
      // carry its docs, so the export statement itself is documented.
      const shape = describeDefaultExport(statement);
      if (shape !== undefined) {
        record(statement, shape);
      }
    }
  }

  for (const [target, names] of exportedNamesByStatement) {
    const shape = describeStatement(target, names);
    if (shape !== undefined) {
      record(target, shape);
    }
  }

  return results.sort((a, b) => a.insertPos - b.insertPos);
}

/**
 * Filters an inventory down to the declarations that still need documentation.
 *
 * @param declarations - The declarations discovered in a file.
 * @returns Only those without an existing doc comment.
 */
export function undocumentedDeclarations(
  declarations: readonly ExportedDeclaration[],
): readonly ExportedDeclaration[] {
  return declarations.filter((declaration) => !declaration.hasDocComment);
}
