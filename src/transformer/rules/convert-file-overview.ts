/**
 * Rule: convert file-level JSDoc tags to `@packageDocumentation`.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const MODULE = /^@module\b/;
const OVERVIEW = /^@(?:fileoverview|file|overview)\b[ \t]*(.*)$/;
const PACKAGE_DOCUMENTATION = /^@packageDocumentation\b/;

/**
 * Reports whether the comment already carries a `@packageDocumentation` tag.
 *
 * @remarks
 * Detection runs through {@link mapCommentLines} rather than a plain substring
 * search so the same fence rules apply: a `@packageDocumentation` shown inside
 * an `@example` block is sample text, not a tag this comment declares. The
 * mapper leaves every line untouched, so the rebuilt comment is discarded.
 *
 * @param comment - The full comment text.
 * @returns `true` when the tag is already present outside a fenced block.
 */
function hasPackageDocumentation(comment: string): boolean {
  let found = false;
  mapCommentLines(comment, (content, context) => {
    if (!context.inFence && PACKAGE_DOCUMENTATION.test(content)) {
      found = true;
    }
    return content;
  });
  return found;
}

/**
 * Converts JSDoc file-level tags to the TSDoc `@packageDocumentation` modifier.
 *
 * @remarks
 * `@packageDocumentation` takes no argument, so `@module lib/foo` drops its
 * path, and `@fileoverview <text>` relocates its prose onto a following summary
 * line (returned as a two-line expansion). Runs through the fence-aware line
 * mapper so file-level tags appearing inside an `@example` code block are left
 * untouched.
 *
 * At most one `@packageDocumentation` is emitted per comment. JSDoc routinely
 * pairs the tags — `@fileoverview` for the prose, `@module` for the name — and
 * translating each one independently produced a comment declaring the modifier
 * twice. Later file-level tags are therefore dropped once the modifier is in
 * place, and any prose they carried is kept as a summary line so no
 * documentation is lost with them.
 *
 * @example
 * ```typescript
 * convertFileOverview.apply("/**\n * @module lib/foo\n *\/");
 * // → "/**\n * @packageDocumentation\n *\/"
 * ```
 */
export const convertFileOverview: Rule = {
  name: "convert-file-overview",
  summary: "Convert @module/@fileoverview to @packageDocumentation.",
  liteSafe: false,
  apply(comment) {
    // Seeded from the existing text so a comment already declaring the modifier
    // never gains a second one from the JSDoc tag sitting next to it.
    let emitted = hasPackageDocumentation(comment);

    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      if (MODULE.test(content)) {
        if (emitted) {
          return null;
        }
        emitted = true;
        return "@packageDocumentation";
      }
      const overview = OVERVIEW.exec(content);
      if (overview) {
        const text = (overview[1] ?? "").trim();
        if (emitted) {
          return text === "" ? null : text;
        }
        emitted = true;
        return text === ""
          ? "@packageDocumentation"
          : ["@packageDocumentation", text];
      }
      return content;
    });
  },
};
