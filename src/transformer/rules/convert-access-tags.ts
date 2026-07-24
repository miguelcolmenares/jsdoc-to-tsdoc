/**
 * Rule: convert JSDoc access tags to TSDoc visibility modifiers.
 *
 * @since 0.1.0
 */

import { ACCESS_MODIFIERS, mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const ACCESS_TAG = /^@access\s+(\w+)\b.*$/;

/**
 * Maps JSDoc access tags to their TSDoc equivalents: `@access private` and the
 * `@private` shorthand become `@internal`, while `@access protected` / `public`
 * become `@protected` / `@public`. Unknown access levels are left untouched for
 * manual review.
 *
 * @example
 * ```typescript
 * convertAccessTags.apply("/** @access private *\/");
 * // → "/** @internal *\/"
 * ```
 */
export const convertAccessTags: Rule = {
  name: "convert-access-tags",
  summary: "Convert @access/@private JSDoc tags to TSDoc modifiers.",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      const trimmed = content.trim();
      const access = ACCESS_TAG.exec(trimmed);
      if (access) {
        const level = access[1]?.toLowerCase() ?? "";
        return ACCESS_MODIFIERS[level] ?? content;
      }
      if (trimmed === "@private") {
        return "@internal";
      }
      return content;
    });
  },
};
