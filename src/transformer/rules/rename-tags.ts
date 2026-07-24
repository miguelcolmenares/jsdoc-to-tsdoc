/**
 * Rule: rename JSDoc tags to their TSDoc equivalents.
 *
 * @since 0.1.0
 */

import { mapCommentLines, TAG_RENAMES } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const LEADING_TAG = /^(\s*)(@[a-zA-Z]+)/;

/**
 * Renames JSDoc block tags that have a directly-equivalent TSDoc tag under a
 * different name — for example `@return` to `@returns`, `@template` to
 * `@typeParam`, and `@default` to `@defaultValue`. The tag's argument is
 * preserved untouched.
 *
 * @example
 * ```typescript
 * renameTags.apply("/** @return the value *\/");
 * // → "/** @returns the value *\/"
 * ```
 */
export const renameTags: Rule = {
  name: "rename-tags",
  summary: "Rename @return/@template/@default to their TSDoc equivalents.",
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      const match = LEADING_TAG.exec(content);
      if (!match) {
        return content;
      }
      const [, whitespace = "", tag = ""] = match;
      const replacement = TAG_RENAMES[tag.toLowerCase()];
      if (!replacement) {
        return content;
      }
      return whitespace + replacement + content.slice(whitespace.length + tag.length);
    });
  },
};
