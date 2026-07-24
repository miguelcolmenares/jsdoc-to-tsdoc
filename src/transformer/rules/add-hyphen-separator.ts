/**
 * Rule: insert the mandatory hyphen separator into `@param` / `@typeParam`.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const COLON_SEPARATOR = /^(@(?:param|typeParam)\s+)([$A-Za-z_][\w$.]*)\s*:\s*/;
const MISSING_SEPARATOR = /^(@(?:param|typeParam)\s+)([$A-Za-z_][\w$.]*)\s+(?!-\s)(\S.*)$/;

/**
 * Ensures `@param` and `@typeParam` use the TSDoc-required `name - description`
 * form. Handles both a missing separator (`@param name description`) and the
 * JSDoc colon style (`@param name: description`). Lines that already have the
 * hyphen, or that carry only a name with no description, are left untouched.
 *
 * @example
 * ```typescript
 * addHyphenSeparator.apply("/** @param name The user name *\/");
 * // → "/** @param name - The user name *\/"
 * ```
 */
export const addHyphenSeparator: Rule = {
  name: "add-hyphen-separator",
  summary: "Insert the `name - description` hyphen in @param/@typeParam.",
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      return content
        .replace(COLON_SEPARATOR, "$1$2 - ")
        .replace(MISSING_SEPARATOR, "$1$2 - $3");
    });
  },
};
