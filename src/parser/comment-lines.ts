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
 * @returns The replacement content: a string, or an array of strings to expand
 * one source line into several (each rebuilt with the same prefix), or `null` to
 * drop the entire physical line (only honored for interior lines — structural
 * lines are never dropped).
 */
export type CommentLineMapper = (
  content: string,
  context: CommentLineContext,
) => string | readonly string[] | null;

interface SplitLine {
  readonly prefix: string;
  readonly content: string;
  readonly suffix: string;
  readonly canDrop: boolean;
}

// Prefixes greedily absorb all post-marker whitespace so that content always
// begins at the first non-space character (robust to arbitrary alignment) while
// the exact spacing is preserved for verbatim reconstruction.
const OPENING_LINE = /^(\s*\/\*\*[ \t]*)(.*)$/;
const SINGLE_LINE = /^(\s*\/\*\*[ \t]*)(.*?)([ \t]?\*\/[ \t]*)$/;
const CLOSING_ONLY = /^\s*\*\/\s*$/;
const CLOSING_WITH_CONTENT = /^(\s*\*[ \t]*)(.*?)([ \t]?\*\/[ \t]*)$/;
const STAR_LINE = /^(\s*\*[ \t]*)(.*)$/;

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
 * @param mapper - Per-line transform; return `null` to drop an interior line,
 * or an array of strings to expand one line into several.
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

    if (mapped === null) {
      return `${prefix}${content}${suffix}`;
    }
    if (typeof mapped === "string") {
      return `${prefix}${mapped}${suffix}`;
    }
    if (mapped.length <= 1) {
      return `${prefix}${mapped[0] ?? content}${suffix}`;
    }
    // A multi-line expansion of a single-line comment: promote it to a proper
    // multi-line block so each produced line becomes its own ` * ` content line
    // (collapsing onto one line would yield invalid TSDoc, e.g. a
    // `@packageDocumentation` modifier followed by an argument).
    const indent = /^\s*/.exec(prefix)?.[0] ?? "";
    const body = mapped.map((line) => `${indent} * ${line}`).join(eol);
    return `${indent}/**${eol}${body}${eol}${indent} */`;
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

    const isEmptyExpansion = Array.isArray(mapped) && mapped.length === 0;
    if (mapped === null || isEmptyExpansion) {
      if (parts.canDrop) {
        return;
      }
      output.push(`${parts.prefix.trimEnd()}${parts.suffix}`);
      return;
    }

    const producedLines = typeof mapped === "string" ? [mapped] : mapped;
    producedLines.forEach((produced, index) => {
      const suffix = index === producedLines.length - 1 ? parts.suffix : "";
      output.push(`${parts.prefix}${produced}${suffix}`);
    });
  });

  return output.join(eol);
}
