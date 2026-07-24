/**
 * Rule: remove JSDoc optional-parameter bracket notation.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const OPTIONAL_BRACKET = /^(@param\s+)\[([^\]=]+)(?:=[^\]]*)?\]/;

/**
 * Rewrites JSDoc optional-parameter notation `@param [name=default]` to the bare
 * `@param name`. TSDoc has no optional-bracket syntax — optionality is expressed
 * by the TypeScript signature, and any default belongs in the description.
 *
 * @example
 * ```typescript
 * stripOptionalParamBrackets.apply("/** @param [limit=100] - Max results *\/");
 * // → "/** @param limit - Max results *\/"
 * ```
 */
export const stripOptionalParamBrackets: Rule = {
  name: "strip-optional-param-brackets",
  summary: "Remove JSDoc optional-parameter [name=default] brackets.",
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) =>
      context.inFence ? content : content.replace(OPTIONAL_BRACKET, "$1$2"),
    );
  },
};
