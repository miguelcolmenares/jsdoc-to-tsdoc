/**
 * Rule: insert the mandatory hyphen separator into `@param` / `@typeParam`.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const COLON_SEPARATOR = /^(@(?:param|typeParam)\s+)([$A-Za-z_][\w$.]*)\s*:\s*/;
const MISSING_SEPARATOR =
  /^(@(?:param|typeParam)\s+)([$A-Za-z_][\w$.]*)\s+(?!-\s)(\S.*)$/;
const BARE_NAME_ONLY = /^(@(?:param|typeParam)\s+)([$A-Za-z_][\w$.]*)\s*$/;

/**
 * Ensures `@param` and `@typeParam` use the TSDoc-required `name - description`
 * form. Handles a missing separator (`@param name description`), the JSDoc
 * colon style (`@param name: description`), and a name with no description at
 * all — a comment-only tool cannot invent what the author would have written,
 * so it gets the same `TODO(tsdoc)` placeholder `scaffold` uses for a
 * declaration with no doc comment, keeping the line valid TSDoc rather than
 * leaving `tsdoc-param-tag-missing-hyphen` for `check` to report. Lines that
 * already have the hyphen are left untouched.
 *
 * @example
 * ```typescript
 * addHyphenSeparator.apply("/** @param name The user name *\/");
 * // → "/** @param name - The user name *\/"
 * addHyphenSeparator.apply("/** @param name *\/");
 * // → "/** @param name - TODO(tsdoc): describe name. *\/"
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
        .replace(MISSING_SEPARATOR, "$1$2 - $3")
        .replace(BARE_NAME_ONLY, "$1$2 - TODO(tsdoc): describe $2.");
    });
  },
};
