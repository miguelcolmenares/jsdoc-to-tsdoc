/**
 * Rule: delete JSDoc-only tags with no TSDoc equivalent.
 *
 * @since 0.1.0
 */

import { JSDOC_ONLY_TAGS, leadingTag, mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

/**
 * Removes entire lines for JSDoc-only tags — `@typedef`, `@callback`, `@type`,
 * and `@property`. The structures they described belong in TypeScript `type` /
 * `interface` declarations, and `@property` blocks are superseded by inline
 * `/** *\/` comments on the interface members themselves.
 *
 * @example
 * ```typescript
 * removeJsdocOnlyTags.apply("/**\n * @property name - The name\n *\/");
 * // → "/**\n *\/"
 * ```
 */
export const removeJsdocOnlyTags: Rule = {
  name: "remove-jsdoc-only-tags",
  summary: "Delete JSDoc-only tags (@typedef, @callback, @type, @property).",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      const tag = leadingTag(content);
      if (tag && JSDOC_ONLY_TAGS.includes(tag)) {
        return null;
      }
      return content;
    });
  },
};
