/**
 * Rule: delete JSDoc tags made redundant by TypeScript syntax.
 *
 * @since 0.1.0
 */

import { leadingTag, mapCommentLines, REDUNDANT_TAGS } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

/**
 * Removes entire lines for tags TypeScript already expresses — `@function`,
 * `@async`, `@class`, `@enum`, `@export`, `@augments`, `@implements`, and
 * friends. The declaration itself conveys everything these tags encoded.
 *
 * @example
 * ```typescript
 * removeRedundantTags.apply("/**\n * Does a thing.\n * @async\n *\/");
 * // → "/**\n * Does a thing.\n *\/"
 * ```
 */
export const removeRedundantTags: Rule = {
  name: "remove-redundant-tags",
  summary: "Delete TypeScript-redundant tags (@function, @async, @class, …).",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      const tag = leadingTag(content);
      if (tag && REDUNDANT_TAGS.includes(tag)) {
        return null;
      }
      return content;
    });
  },
};
