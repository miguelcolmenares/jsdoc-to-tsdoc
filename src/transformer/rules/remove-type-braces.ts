/**
 * Rule: strip `{Type}` brace annotations from block tags.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const TYPE_BRACE = /^(@(?:param|returns?|property|prop|typeParam|type)\s+)\{[^}]*\}\s*/;

/**
 * Removes redundant `{Type}` annotations after `@param`, `@returns`, and
 * related tags. TSDoc derives parameter and return types from the surrounding
 * TypeScript signature, so brace annotations are both redundant and rejected by
 * the official parser.
 *
 * @example
 * ```typescript
 * removeTypeBraces.apply("/** @param {string} name - The name. *\/");
 * // → "/** @param name - The name. *\/"
 * ```
 */
export const removeTypeBraces: Rule = {
  name: "remove-type-braces",
  summary: "Strip `{Type}` braces from @param/@returns/@property tags.",
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) =>
      context.inFence ? content : content.replace(TYPE_BRACE, "$1"),
    );
  },
};
