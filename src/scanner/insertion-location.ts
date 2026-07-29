/**
 * Where a generated doc comment must be spliced into a source file, and what
 * comment — if any — already sits in that position.
 *
 * @remarks
 * "Already documented" is the coarsest of several answers this module gives.
 * The slot above a declaration can hold a doc comment, a run of `//` prose that
 * `convert` could promote, a tooling directive that documents nothing, or a
 * plain block comment; callers need to tell those apart, so
 * {@link readLeadingComment} labels the comment rather than reducing it to a
 * boolean. {@link hasLeadingDocComment} is that boolean, for the callers that
 * only need the presence rule's answer.
 *
 * Every question is answered from the source file's line map rather than by
 * slicing text per declaration, so a file with many exports stays linear.
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

/**
 * What kind of comment sits immediately above a declaration.
 *
 * - `doc` — a `/** *\/` comment, the only kind that documents it for TSDoc.
 * - `line` — one or more `//` lines, prose that `convert` could promote.
 * - `directive` — `//` lines that are all tooling instructions, which document
 *   nothing despite occupying the same position as prose.
 * - `block` — a plain `/* *\/` comment, which documents nothing.
 */
export type LeadingCommentKind = "doc" | "line" | "directive" | "block";

// Instructions to other tools, not prose. Reporting `// eslint-disable-next-line`
// as documentation to promote would send someone to a declaration that has none.
//
// Two forms: a triple-slash directive (`/// <reference … />`), and the `//`
// pragmas below. `@ts-` and `@jsx` are matched by prefix rather than by listing
// each one, so `@ts-check` and `@ts-expect-error` are covered by the same
// branch — enumerating them was how `@ts-check` came to be missed.
const DIRECTIVE =
  /^\/\/(?:\/[ \t]*<|[ \t]*(?:eslint-(?:disable|enable)|@ts-[\w-]+|@jsx[A-Za-z]*|prettier-ignore|biome-ignore|dprint-ignore|deno-lint-ignore|noinspection|#(?:end)?region|(?:istanbul|c8|v8)[ \t]+ignore|webpackChunkName))/;

/**
 * The comment attached to a declaration.
 */
export interface LeadingComment {
  /** Which kind of comment it is. */
  readonly kind: LeadingCommentKind;
  /**
   * The comment text. For a `line` run this is every consecutive `//` line
   * joined with newlines, since JSDoc-style prose written with line comments
   * spans several of them.
   */
  readonly text: string;
  /** 1-based line where the attached comment begins. */
  readonly line: number;
  /**
   * Offset where the comment starts — the first `//` of a run, not the
   * indentation before it.
   */
  readonly pos: number;
  /** Offset just past the comment, or past the last line of a run. */
  readonly end: number;
}

/**
 * Reports whether a `//` line is an instruction to another tool.
 *
 * @remarks
 * Exported because a caller rewriting comments needs it and
 * {@link LeadingComment.kind} deliberately will not answer it: a run counts as
 * prose the moment one line is not a directive, so a `line` comment can still
 * contain one. Promoting such a run into a `/** *\/` block would move the
 * directive inside a block comment, where it stops working and no longer names
 * the line it applied to.
 *
 * @param line - One `//` line, leading whitespace already trimmed.
 * @returns `true` when the line instructs a tool rather than documenting code.
 */
export function isToolDirective(line: string): boolean {
  return DIRECTIVE.test(line.trim());
}

/**
 * Reads the comment attached to a declaration, if any.
 *
 * @remarks
 * Attachment is a position, not a meaning. A `// eslint-disable-next-line` or a
 * plain `/* … *\/` block occupies exactly the slot a doc comment would, and both
 * are returned — labelled by {@link LeadingComment.kind} — rather than dropped.
 * Callers disagree about what counts: the presence rule wants `doc` alone, while
 * `convert` needs to see the `line` prose it could promote and the classifier
 * needs to tell an undocumented export from one that only carries a directive.
 * Deciding here would force every caller to inherit one caller's definition.
 *
 * Leading trivia can hold comments that document something other than this
 * declaration — most commonly a file-level `@packageDocumentation` header above
 * the first export, but also any note left a blank line further up. Counting
 * those would make `scaffold` skip a declaration that
 * `tsdoc-require-2/require` still reports as undocumented, so `--check` would
 * pass while lint failed.
 *
 * A comment therefore counts only when it is the one closest to the declaration
 * and no blank line separates the two. Both boundaries are where the presence
 * rule itself draws them: it reports the declaration below a detached header,
 * or below `/** … *\/` followed by an `// eslint-disable` line, as
 * undocumented, while an adjacent doc comment satisfies it.
 *
 * A run of `//` lines is gathered as one comment because that is how such prose
 * is written, but the run stops at a blank line for the same reason a doc
 * comment does — the note further up belongs to something else.
 *
 * @param sourceFile - The parsed source file the node belongs to.
 * @param node - The declaration to inspect.
 * @returns The attached comment, or `undefined` when nothing is attached.
 */
export function readLeadingComment(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): LeadingComment | undefined {
  const sourceText = sourceFile.text;
  const ranges =
    ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];

  // Only the last comment can document the declaration; anything earlier is
  // separated from it by another comment.
  const nearest = ranges[ranges.length - 1];
  if (nearest === undefined) {
    return undefined;
  }

  // A blank line between the comment and the declaration detaches the two.
  const gap = sourceText.slice(nearest.end, node.getStart(sourceFile, false));
  if (/\n[ \t\r]*\n/.test(gap)) {
    return undefined;
  }

  const text = sourceText.slice(nearest.pos, nearest.end);
  const lineOf = (pos: number): number =>
    sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

  if (nearest.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
    const isDoc = text.startsWith("/**") && text !== "/**/";
    return {
      kind: isDoc ? "doc" : "block",
      text,
      line: lineOf(nearest.pos),
      pos: nearest.pos,
      end: nearest.end,
    };
  }

  // Walk back over the consecutive `//` lines that form one block of prose,
  // stopping at a blank line or at any other kind of comment.
  let first = ranges.length - 1;
  while (first > 0) {
    const previous = ranges[first - 1];
    const current = ranges[first];
    if (
      previous === undefined ||
      current === undefined ||
      previous.kind !== ts.SyntaxKind.SingleLineCommentTrivia ||
      /\n[ \t\r]*\n/.test(sourceText.slice(previous.end, current.pos))
    ) {
      break;
    }
    first -= 1;
  }

  const run = ranges
    .slice(first)
    .map((range) => sourceText.slice(range.pos, range.end));
  const start = ranges[first];

  // A run counts as prose the moment one of its lines is not a directive: a
  // note followed by an `// eslint-disable-next-line` is still documentation.
  const isDirective = run.every((line) => DIRECTIVE.test(line));

  return {
    kind: isDirective ? "directive" : "line",
    text: run.join("\n"),
    line: lineOf(start === undefined ? nearest.pos : start.pos),
    pos: start === undefined ? nearest.pos : start.pos,
    end: nearest.end,
  };
}

/**
 * Reports whether a declaration already has a leading `/** *\/` doc comment.
 *
 * @param sourceFile - The parsed source file the node belongs to.
 * @param node - The declaration to inspect.
 * @returns `true` when a JSDoc-style comment documents this declaration.
 */
export function hasLeadingDocComment(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): boolean {
  return readLeadingComment(sourceFile, node)?.kind === "doc";
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
): {
  insertPos: number;
  insertEnd: number;
  indent: string;
  line: number;
  ownsLine: boolean;
} {
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
    // The stub moves this declaration onto a line of its own, so the spaces or
    // tabs that separated it from the previous statement are swallowed by the
    // replacement. Leaving them behind would strand trailing whitespace at the
    // end of the previous line, which formatters and whitespace rules flag.
    const separator = /[ \t]*$/.exec(prefix)?.[0] ?? "";
    return {
      insertPos: start - separator.length,
      insertEnd: start,
      indent,
      line: line + 1,
      ownsLine: false,
    };
  }

  return {
    insertPos: lineStart,
    insertEnd: lineStart,
    indent,
    line: line + 1,
    ownsLine: true,
  };
}
