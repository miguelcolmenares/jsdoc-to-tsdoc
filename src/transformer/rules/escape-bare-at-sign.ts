/**
 * Rule: backtick a bare `@` that appears mid-line in prose so TSDoc stops
 * reading it as a block tag.
 *
 * @since 0.1.0
 */

import { classifyTag } from "@/generator";
import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

// Matches an inline code span or an `@`-led token. The span branch is first so
// an `@` already inside backticks is consumed there and never seen as a tag.
//
// The token is deliberately wider than a bare tag name: it also covers the two
// `@` shapes TSDoc flags mid-prose that are not tags at all — a TypeScript path
// alias (`@/lib/thing`) and a scoped npm package (`@scope/pkg`), both of which
// carry `/`, `.`, or `-`. So the first character after `@` may be a letter,
// digit, or `/`, and the run continues through path characters. A trailing
// sentence period is trimmed back off in the callback.
const SPAN_OR_TOKEN = /`[^`]*`|@[a-zA-Z0-9/][\w/.-]*/g;

// A trailing period is the one punctuation the token grammar can swallow that
// belongs to the sentence, not the token: it is in the run's character class
// only so `@/lib.` at a sentence end still matches. `/`, `-`, and `_` are left
// in place — they are meaningful in a path alias or scoped package (`@/lib/`,
// `@scope/pkg-name`), and stripping them would corrupt the very tokens the rule
// exists to protect. Other punctuation (`,`, `)`, `"`) is not in the class, so
// the match already stops before it.
const TRAILING_PERIOD = /\.+$/;

/**
 * Escapes every undefined `@` token on a single prose line, leaving the tag
 * that opens the line and anything already inside a code span untouched.
 *
 * @param content - One content line, its ` * ` prefix already removed.
 * @returns The line with bare `@` tokens wrapped in backticks.
 */
function escapeLine(content: string): string {
  const firstNonWhitespace = content.length - content.trimStart().length;
  return content.replace(SPAN_OR_TOKEN, (match: string, offset: number) => {
    // A code span (it opens with a backtick, not `@`) is already literal.
    if (!match.startsWith("@")) {
      return match;
    }
    // The token that opens the line is a real block tag by position — even a
    // project custom the config legitimately defines — so never rewrite it.
    if (offset === firstNonWhitespace) {
      return match;
    }
    // A trailing period belongs to the sentence, not the token, so it stays
    // outside the backticks: `@/lib.` escapes to `` `@/lib`. ``
    const token = match.replace(TRAILING_PERIOD, "");
    const trailer = match.slice(token.length);
    // Only a token TSDoc does not define is a hazard. A standard or known
    // custom tag mid-prose is left alone: wrapping it risks changing meaning
    // for no parse benefit. A path or scope always classifies as unknown, so it
    // passes this gate; a bare `@remarks` does not.
    if (classifyTag(token) !== "unknown") {
      return match;
    }
    return `\`${token}\`${trailer}`;
  });
}

/**
 * Wraps a bare `@token` that sits mid-line in prose so the official parser
 * reads it as text, not as a tag.
 *
 * @remarks
 * An `@` that is not the first token on its line — a TypeScript path alias like
 * `@/lib/thing`, a scoped package like `@scope/pkg`, an address, a decorator
 * named in a sentence — is still read by TSDoc as a tag, which turns an
 * undefined name into a `check` error over a comment that was never wrong.
 * Wrapping just the token in backticks makes it an inline code span, which the
 * parser leaves alone, and is exactly what a person migrating by hand writes.
 * On the `osa-nextjs` measurement, path aliases in re-export headers are the
 * whole of this error class.
 *
 * Three things are never touched. A tag that opens its line is a real block tag
 * by position — including a project custom the config legitimately defines — so
 * rewriting it would corrupt real documentation. A token already inside a code
 * span or a fenced block is literal already. And a standard or known-custom tag
 * name is left as written, since escaping it risks changing meaning for no parse
 * benefit; only an unknown token is a candidate.
 *
 * @example
 * ```typescript
 * escapeBareAtSign.apply("/**\n * Ping @support for help.\n *\/", {
 *   lite: false,
 * });
 * // → the `@support` token wrapped in backticks
 * ```
 */
export const escapeBareAtSign: Rule = {
  name: "escape-bare-at-sign",
  summary:
    "Backtick a bare @token in prose so TSDoc stops reading it as a tag.",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      return escapeLine(content);
    });
  },
};
