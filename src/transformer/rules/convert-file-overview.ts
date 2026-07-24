/**
 * Rule: convert file-level JSDoc tags to `@packageDocumentation`.
 *
 * @since 0.1.0
 */

import type { Rule } from "@/transformer/pipeline";

const MODULE_LINE = /^([ \t]*\*[ \t]*)@module\b[^\n]*$/gm;
const OVERVIEW_WITH_TEXT = /^([ \t]*\*[ \t]*)@(?:fileoverview|file|overview)[ \t]+(\S[^\n]*)$/gm;
const OVERVIEW_BARE = /^([ \t]*\*[ \t]*)@(?:fileoverview|file|overview)[ \t]*$/gm;

/**
 * Converts JSDoc file-level tags to the TSDoc `@packageDocumentation` modifier.
 *
 * @remarks
 * `@packageDocumentation` takes no argument, so `@module lib/foo` drops its
 * path, and `@fileoverview <text>` relocates its prose onto the following
 * summary line. This is a whole-comment rewrite rather than a per-line map
 * because it expands one source line into two.
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
    return comment
      .replace(MODULE_LINE, "$1@packageDocumentation")
      .replace(OVERVIEW_WITH_TEXT, "$1@packageDocumentation\n$1$2")
      .replace(OVERVIEW_BARE, "$1@packageDocumentation");
  },
};
