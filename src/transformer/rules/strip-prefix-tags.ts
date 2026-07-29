/**
 * Rule: reduce descriptive JSDoc tags to their prose.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const DESCRIPTION_PREFIX = /^@(?:desc(?:ription)?|classdesc)\s+/i;
const DESCRIPTION_BARE = /^@(?:desc(?:ription)?|classdesc)\s*$/i;

/**
 * Strips descriptive tag prefixes (`@description`, `@desc`, `@classdesc`),
 * keeping their text as the comment summary. In TSDoc the leading paragraph is
 * the summary, so the tag itself is unnecessary.
 *
 * @example
 * ```typescript
 * stripPrefixTags.apply("/** @description Formats a value. *\/");
 * // → "/** Formats a value. *\/"
 * ```
 */
export const stripPrefixTags: Rule = {
  name: "strip-prefix-tags",
  summary: "Reduce @description/@classdesc tags to plain summary prose.",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      return content
        .replace(DESCRIPTION_PREFIX, "")
        .replace(DESCRIPTION_BARE, "");
    });
  },
};
