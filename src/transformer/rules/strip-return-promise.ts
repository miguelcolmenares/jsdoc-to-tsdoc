/**
 * Rule: remove `Promise<...>` type wrappers from `@returns` descriptions.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const RETURNS_PROMISE_WITH_DESC = /^(@returns)\s+Promise<[^>]*>\s*-\s*/;
const RETURNS_PROMISE_ONLY = /^(@returns)\s+Promise<[^>]*>\s*$/;

/**
 * Strips an inline `Promise<...>` type from a `@returns` line. Written without
 * type braces, the angle brackets are otherwise parsed as HTML by the TSDoc
 * parser (`tsdoc-html-tag-missing-greater-than`). The description, when present,
 * is kept.
 *
 * @example
 * ```typescript
 * stripReturnPromise.apply("/** @returns Promise<User | null> - The user *\/");
 * // → "/** @returns The user *\/"
 * ```
 */
export const stripReturnPromise: Rule = {
  name: "strip-return-promise",
  summary: "Remove Promise<T> wrappers from @returns descriptions.",
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      return content
        .replace(RETURNS_PROMISE_WITH_DESC, "$1 ")
        .replace(RETURNS_PROMISE_ONLY, "$1");
    });
  },
};
