/**
 * Where a generated doc comment must be spliced into a source file, and whether
 * one is already there.
 *
 * @remarks
 * Both questions are answered from the source file's line map rather than by
 * slicing text per declaration, so a file with many exports stays linear.
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

/**
 * Reports whether a declaration already has a leading `/** *\/` doc comment.
 *
 * @remarks
 * Leading trivia can hold comments that document something other than this
 * declaration — most commonly a file-level `@packageDocumentation` header above
 * the first export, but also any note left a blank line further up. Counting
 * those would make `scaffold` skip a declaration that
 * `tsdoc-require-2/require` still reports as undocumented, so `--check` would
 * pass while lint failed.
 *
 * Only the doc comment nearest the declaration is considered, and only when no
 * blank line separates the two. That matches where the presence rule itself
 * draws the line: a header followed by a blank line does not document the
 * export below it, while an adjacent comment does.
 *
 * @param sourceFile - The parsed source file the node belongs to.
 * @param node - The declaration to inspect.
 * @returns `true` when a JSDoc-style comment documents this declaration.
 */
export function hasLeadingDocComment(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const sourceText = sourceFile.text;
  const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];

  let nearest: ts.CommentRange | undefined;
  for (const range of ranges) {
    const text = sourceText.slice(range.pos, range.end);
    if (
      range.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
      text.startsWith("/**") &&
      text !== "/**/"
    ) {
      nearest = range;
    }
  }

  if (nearest === undefined) {
    return false;
  }

  // A blank line between the comment and the declaration detaches the two.
  const gap = sourceText.slice(nearest.end, node.getStart(sourceFile, false));
  return !/\n[ \t\r]*\n/.test(gap);
}

/**
 * Computes where a doc comment for a declaration must be inserted, and with what
 * indentation.
 *
 * @remarks
 * The insertion point is the start of the declaration's own line — not
 * `node.getStart()` — so the stub lands above any `export` keyword and aligns
 * with the code it documents.
 *
 * Positions come from the source file's line map (a binary search over
 * precomputed line starts) rather than from slicing and splitting the source
 * text, which would cost O(n) time and memory per declaration and make a file
 * with many exports quadratic.
 *
 * When another statement shares the line (`const a = 1; export const b = 2;`),
 * inserting at the line start would attach the comment to that earlier
 * statement instead. In that case the stub is anchored at the declaration
 * itself, which keeps the documentation on the symbol it describes.
 *
 * @param sourceFile - The parsed source file, used for its line map.
 * @param node - The declaration to document.
 * @returns The insertion offset, the line's indentation, and its 1-based line number.
 */
export function locateInsertion(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { insertPos: number; indent: string; line: number; ownsLine: boolean } {
  const start = node.getStart(sourceFile, /* includeJsDocComment */ false);
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  const lineStart = sourceFile.getPositionOfLineAndCharacter(line, 0);
  const prefix = sourceFile.text.slice(lineStart, start);

  // Only leading whitespace may separate the line start from the declaration;
  // anything else means the line already holds other code. The line's own
  // indentation is still what the stub must align to, so it is reported either
  // way.
  const indent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
  if (!/^[ \t]*$/.test(prefix)) {
    return { insertPos: start, indent, line: line + 1, ownsLine: false };
  }

  return { insertPos: lineStart, indent, line: line + 1, ownsLine: true };
}
