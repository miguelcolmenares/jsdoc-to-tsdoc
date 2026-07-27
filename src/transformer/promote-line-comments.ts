/**
 * Rewrites a run of `//` prose as the `/** *\/` comment it was already serving
 * as.
 *
 * @remarks
 * A separate concern from the rule pipeline, which rewrites the inside of a
 * comment that already exists. This changes what kind of comment it is, so it
 * needs the run's position in the source rather than its text alone, and it has
 * to decide whether the rewrite is safe at all — two things a rule is never
 * handed.
 *
 * Nothing here invents or reformats prose. The words a person wrote are carried
 * across unchanged, punctuation included: the only reason this run is worth
 * promoting is that a human already said what the declaration does better than
 * an inferred summary would, and editing it would give that up for tidiness.
 *
 * @since 0.1.0
 */

import { isToolDirective } from "@/scanner";

/** Ends a block comment, so no promoted line may contain it. */
const COMMENT_TERMINATOR = "*/";

/**
 * Strips the `//` marker from one line of a run.
 *
 * @param line - One `//` line of the run, with its original indentation.
 * @returns The prose after the marker, without the single space that
 * conventionally follows it.
 */
function uncomment(line: string): string {
  return line.trim().replace(/^\/\/[ \t]?/, "");
}

/**
 * Reports whether a run of `//` lines can safely become a block comment.
 *
 * @remarks
 * Two runs are refused, both because rewriting them would change what the code
 * does rather than how it reads.
 *
 * A run containing a tooling directive is left alone. `readLeadingComment`
 * labels a run as prose the moment one line is not a directive, so a note
 * followed by `// eslint-disable-next-line` arrives here as promotable text.
 * Moving that line inside a block comment stops it working, and lifting the
 * prose out above it would leave the directive between the new comment and the
 * declaration — where the presence rule reports the declaration as undocumented
 * anyway, so the rewrite would change the file and gain nothing.
 *
 * A run containing `*\/` is left alone because that sequence would close the
 * comment early, splicing the rest of the prose into the source as code.
 *
 * @param lines - The run's lines, `//` markers included.
 * @returns `true` when the run can be rewritten without changing behaviour.
 */
export function canPromote(lines: readonly string[]): boolean {
  return lines.every(
    (line) =>
      !isToolDirective(line) && !uncomment(line).includes(COMMENT_TERMINATOR),
  );
}

/**
 * Renders a run of `//` prose as a `/** *\/` comment.
 *
 * @remarks
 * A single line becomes a single-line comment, which is what a person writes
 * for a one-sentence summary and what the rest of `convert` already emits when
 * it moves a description onto a member. Anything longer becomes the block form,
 * one prose line per comment line, so the shape the author chose survives.
 *
 * A blank `//` line renders as a bare ` *`, keeping the paragraph break that
 * separates a summary from what follows it.
 *
 * @param lines - The run's lines, `//` markers included.
 * @param indent - The indentation the comment must align to.
 * @returns The comment text, without the trailing newline that reattaches it to
 * the declaration.
 *
 * @example
 * ```typescript
 * renderPromoted(["// Revalidate weekly (ISR)"], "");
 * // → "/** Revalidate weekly (ISR) *\/"
 * ```
 */
export function renderPromoted(
  lines: readonly string[],
  indent: string,
): string {
  const prose = lines.map(uncomment);

  const [only] = prose;
  if (prose.length === 1 && only !== undefined && only !== "") {
    return `/** ${only} */`;
  }

  const body = prose
    .map((line) => (line === "" ? `${indent} *` : `${indent} * ${line}`))
    .join("\n");
  return `/**\n${body}\n${indent} */`;
}
