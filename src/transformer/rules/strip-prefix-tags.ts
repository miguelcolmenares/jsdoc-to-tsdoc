/**
 * Rule: reduce descriptive JSDoc tags to their prose.
 *
 * @since 0.1.0
 */

import { PREFIX_ONLY_TAGS, mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

// Built from the registry rather than hand-written, so a tag added to
// `PREFIX_ONLY_TAGS` takes effect here. The two drifted apart once already:
// `@summary` sat in no list at all, and `convert` left it in place for `check`
// to reject as `tsdoc-undefined-tag` (#84).
//
// Alternation order is irrelevant — the regex engine backtracks, so
// `@description` matches whole even though `@desc` is a prefix of it, and
// `@descriptor` matches neither because the trailing `\s` never lines up.
//
// The names are escaped because they are registry data, not literals here: no
// JSDoc tag contains a metacharacter today, but an unescaped `.` in a future
// entry would quietly match any character rather than fail loudly.
const PREFIX_TAG_NAMES = PREFIX_ONLY_TAGS.map((tag) =>
  tag.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|");
const DESCRIPTION_PREFIX = new RegExp(`^@(?:${PREFIX_TAG_NAMES})\\s+`, "i");
const DESCRIPTION_BARE = new RegExp(`^@(?:${PREFIX_TAG_NAMES})\\s*$`, "i");

/**
 * Strips descriptive tag prefixes (`@description`, `@desc`, `@classdesc`,
 * `@summary`), keeping their text as the comment summary. In TSDoc the leading
 * paragraph is the summary, so the tag itself is unnecessary.
 *
 * @example
 * ```typescript
 * stripPrefixTags.apply("/** @description Formats a value. *\/");
 * // → "/** Formats a value. *\/"
 * ```
 */
export const stripPrefixTags: Rule = {
  name: "strip-prefix-tags",
  summary:
    "Reduce @description/@classdesc/@summary tags to plain summary prose.",
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
