/**
 * Extraction of `/** *\/` comments from TypeScript source via the compiler API.
 *
 * @remarks
 * Using `ts.getLeadingCommentRanges` over a parsed source file yields precise
 * comment offsets without the fragility of matching `/** *\/` with a regular
 * expression (which would also match inside strings and template literals).
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

/**
 * A doc comment located within a source file, with the offsets needed to splice
 * a replacement back in.
 */
export interface SourceComment {
  /** Offset of the opening `/` of the comment. */
  readonly pos: number;
  /** Offset immediately after the closing `/` of the comment. */
  readonly end: number;
  /** The raw comment text, including the `/**` and `*\/` delimiters. */
  readonly text: string;
}

/**
 * A replacement to apply to a source file: new `text` for the `[pos, end)` span.
 */
export interface SourceEdit {
  /** Start offset of the span to replace. */
  readonly pos: number;
  /** End offset of the span to replace. */
  readonly end: number;
  /** Replacement text. */
  readonly text: string;
}

/**
 * Extracts every JSDoc-style (`/** *\/`) comment from a source file.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name, used only to pick the TS/TSX dialect.
 * @returns The comments in source order, de-duplicated by position.
 */
export function extractJsDocComments(
  sourceText: string,
  fileName: string,
): readonly SourceComment[] {
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

  const found = new Map<number, SourceComment>();

  const visit = (node: ts.Node): void => {
    const ranges =
      ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
    for (const range of ranges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      const text = sourceText.slice(range.pos, range.end);
      if (text.startsWith("/**") && text !== "/**/") {
        found.set(range.pos, { pos: range.pos, end: range.end, text });
      }
    }
    node.forEachChild(visit);
  };

  visit(sourceFile);

  return [...found.values()].sort((a, b) => a.pos - b.pos);
}

/**
 * Applies a set of span replacements to source text.
 *
 * @remarks
 * Edits are applied from the highest offset down so that each splice leaves
 * earlier offsets valid. Overlapping edits are the caller's responsibility to
 * avoid.
 *
 * @param sourceText - The original source file contents.
 * @param edits - The replacements to apply.
 * @returns The source text with every edit applied.
 */
export function applyEdits(
  sourceText: string,
  edits: readonly SourceEdit[],
): string {
  const ordered = [...edits].sort((a, b) => b.pos - a.pos);
  let output = sourceText;
  for (const edit of ordered) {
    output = output.slice(0, edit.pos) + edit.text + output.slice(edit.end);
  }
  return output;
}
