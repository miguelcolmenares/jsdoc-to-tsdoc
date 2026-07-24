/**
 * Structural, fence-aware iteration over the content lines of a `/** *\/` block.
 *
 * @remarks
 * Every transformer rule operates on the *content* of a doc comment — the text
 * after the leading ` * ` on each line — never on the comment's structural
 * scaffolding (`/**`, ` *`, `*\/`) or on text inside fenced code blocks. This
 * module centralizes that traversal so individual rules stay tiny and cannot
 * accidentally corrupt formatting or rewrite example code.
 *
 * @since 0.1.0
 */

/**
 * Context passed to a {@link CommentLineMapper} for each content line.
 */
export interface CommentLineContext {
  /**
   * Whether the line sits inside a triple-backtick fenced code block, including
   * the fence delimiter lines themselves. Rules should leave such lines
   * untouched to preserve example code verbatim.
   */
  readonly inFence: boolean;
  /** Zero-based index among the comment's content lines. */
  readonly index: number;
}

/**
 * Transforms a single content line.
 *
 * @param content - The line text with its ` * ` prefix and any trailing `*\/`
 * already removed.
 * @param context - Positional and fence state for the line.
 * @returns The replacement content, or `null` to drop the entire physical line
 * (only honored for interior lines — structural lines are never dropped).
 */
export type CommentLineMapper = (
  content: string,
  context: CommentLineContext,
) => string | null;

interface SplitLine {
  readonly prefix: string;
  readonly content: string;
  readonly suffix: string;
  readonly canDrop: boolean;
}

const OPENING_LINE = /^(\s*\/\*\*\s?)(.*)$/;
const SINGLE_LINE = /^(\s*\/\*\*\s?)(.*?)(\s?\*\/\s*)$/;
const CLOSING_ONLY = /^\s*\*\/\s*$/;
const CLOSING_WITH_CONTENT = /^(\s*\*\s?)(.*?)(\s?\*\/\s*)$/;
const STAR_LINE = /^(\s*\*\s?)(.*)$/;

/**
 * Splits one physical line into its structural prefix, editable content, and
 * trailing suffix, or returns `null` when the line is purely structural and
 * must be emitted verbatim.
 *
 * @param line - The raw physical line.
 * @param isFirst - Whether this is the comment's first line.
 * @param isLast - Whether this is the comment's last line.
 * @returns The split parts, or `null` for verbatim passthrough.
 */
function splitCommentLine(
  line: string,
  isFirst: boolean,
  isLast: boolean,
): SplitLine | null {
  if (isLast && CLOSING_ONLY.test(line)) {
    return null;
  }

  if (isLast && !isFirst) {
    const closing = CLOSING_WITH_CONTENT.exec(line);
    if (closing) {
      const [, prefix = "", content = "", suffix = ""] = closing;
      return { prefix, content, suffix, canDrop: false };
    }
  }

  if (isFirst) {
    const opening = OPENING_LINE.exec(line);
    if (opening) {
      const [, prefix = "", content = ""] = opening;
      return { prefix, content, suffix: "", canDrop: false };
    }
  }

  const star = STAR_LINE.exec(line);
  if (star) {
    const [, prefix = "", content = ""] = star;
    return { prefix, content, suffix: "", canDrop: true };
  }

  return null;
}

/**
 * Applies `mapper` to each editable content line of a doc comment, preserving
 * structural scaffolding, indentation, and end-of-line style.
 *
 * @param comment - The full `/** *\/` comment text.
 * @param mapper - Per-line transform; return `null` to drop an interior line.
 * @returns The rewritten comment.
 *
 * @example
 * ```typescript
 * mapCommentLines(raw, (content) =>
 *   content.startsWith("@async") ? null : content,
 * );
 * ```
 */
export function mapCommentLines(
  comment: string,
  mapper: CommentLineMapper,
): string {
  const eol = comment.includes("\r\n") ? "\r\n" : "\n";
  const rawLines = comment.split(/\r?\n/);

  const single = rawLines.length === 1 ? SINGLE_LINE.exec(comment) : null;
  if (single) {
    const [, prefix = "", content = "", suffix = ""] = single;
    const mapped = mapper(content, { inFence: false, index: 0 });
    return `${prefix}${mapped ?? content}${suffix}`;
  }

  const output: string[] = [];
  let inFence = false;
  let contentIndex = 0;

  rawLines.forEach((line, i) => {
    const parts = splitCommentLine(line, i === 0, i === rawLines.length - 1);
    if (!parts) {
      output.push(line);
      return;
    }

    const isFenceDelimiter = parts.content.trim().startsWith("```");
    const context: CommentLineContext = {
      inFence: inFence || isFenceDelimiter,
      index: contentIndex,
    };
    contentIndex += 1;

    const mapped = mapper(parts.content, context);
    if (isFenceDelimiter) {
      inFence = !inFence;
    }

    if (mapped === null) {
      if (parts.canDrop) {
        return;
      }
      output.push(`${parts.prefix.trimEnd()}${parts.suffix}`);
      return;
    }

    output.push(`${parts.prefix}${mapped}${parts.suffix}`);
  });

  return output.join(eol);
}
