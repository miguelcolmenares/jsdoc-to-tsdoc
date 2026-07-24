/**
 * Rule: convert file-level JSDoc tags to `@packageDocumentation`.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

const MODULE = /^@module\b/;
const OVERVIEW = /^@(?:fileoverview|file|overview)\b[ \t]*(.*)$/;

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
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      if (MODULE.test(content)) {
        return "@packageDocumentation";
      }
      const overview = OVERVIEW.exec(content);
      if (overview) {
        const text = (overview[1] ?? "").trim();
        return text ? ["@packageDocumentation", text] : "@packageDocumentation";
      }
      return content;
    });
  },
};
