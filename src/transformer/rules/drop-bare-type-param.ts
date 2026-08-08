/**
 * Rule: drop a description-less `@typeParam` that would be invalid TSDoc.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

// A `@typeParam` line carrying only one or more type-parameter names — no
// hyphen, no prose. By the time this rule runs, `add-hyphen-separator` has
// already given every *described* type param its ` - `, so anything still
// matching here documents nothing. `@typeParam T`, `@typeParam T, U`, and
// `@typeParam T,U` all match; `@typeParam T - The element` does not.
const BARE_TYPE_PARAM =
  /^@typeParam\s+[$A-Za-z_][\w$]*(?:\s*,\s*[$A-Za-z_][\w$]*)*\s*$/;

/**
 * Removes a `@typeParam` whose only content is the type-parameter name(s).
 *
 * @remarks
 * TSDoc requires `@typeParam name - description`, exactly like `@param`, so a
 * bare `@typeParam T` fails `check` with `tsdoc-param-tag-missing-hyphen`. This
 * most often arrives from a JSDoc `@template T` with no description, which
 * `rename-tags` renames to a bare `@typeParam T`; a hand-written bare
 * `@typeParam` is caught the same way. The tag documents nothing a reader
 * cannot already see in the declaration's `<T>` clause, so it is dropped rather
 * than left to break validation — no prose is lost because there was none.
 *
 * A bare `@param` is deliberately *not* dropped: unlike a type parameter, a
 * value parameter's name is the tool's only record that the author meant to
 * document it, and that gap is surfaced by `check` for a human to fill.
 *
 * A single-line comment (`/** @typeParam T *\/`) is left untouched, since the
 * tag is the comment's whole content and dropping it would leave an empty
 * `/** *\/` — the same single-line limitation `fold-dotted-param` records.
 *
 * @example
 * ```typescript
 * dropBareTypeParam.apply("/**\n * @typeParam T\n *\/");
 * // → "/**\n *\/"
 * ```
 */
export const dropBareTypeParam: Rule = {
  name: "drop-bare-type-param",
  summary: "Drop a description-less @typeParam that would be invalid TSDoc.",
  // Lite-safe so `convert --lite` on `@template T` does not leave a bare,
  // invalid `@typeParam T` behind: `rename-tags` is itself lite-safe, so the
  // rule that keeps its output valid must be too.
  liteSafe: true,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }
      return BARE_TYPE_PARAM.test(content) ? null : content;
    });
  },
};
