/**
 * @packageDocumentation
 * The ordered set of JSDoc → TSDoc conversion rules.
 *
 * Order matters. Fencing runs first: every other rule skips fenced lines, so an
 * `@example` body is put beyond their reach before any of them sees it — the
 * point of a fence being that sample code is not documentation to rewrite.
 * Escaping bare `@` in prose runs next, before any rule that reads line-opening
 * tags, so a mid-line `@token` is turned into a code span while the real block
 * tags are still exactly where those rules expect them. Then type braces are
 * stripped and tags renamed before separators are inserted. Folding dotted
 * `@param parent.child` runs after the hyphen separator, so every child already
 * carries the ` - ` the fold parses. Structural line removals run last so
 * earlier rules see the full comment — dropping a bare `@typeParam` among them,
 * after the hyphen rule has had its chance to make it valid. `RULES` is frozen
 * to keep the pipeline deterministic.
 *
 * @since 0.1.0
 */

import type { Rule } from "@/transformer/pipeline";

import { addHyphenSeparator } from "@/transformer/rules/add-hyphen-separator";
import { convertAccessTags } from "@/transformer/rules/convert-access-tags";
import { convertFileOverview } from "@/transformer/rules/convert-file-overview";
import { dropBareTypeParam } from "@/transformer/rules/drop-bare-type-param";
import { escapeBareAtSign } from "@/transformer/rules/escape-bare-at-sign";
import { fenceExampleBlocks } from "@/transformer/rules/fence-example-blocks";
import { foldDottedParam } from "@/transformer/rules/fold-dotted-param";
import { removeJsdocOnlyTags } from "@/transformer/rules/remove-jsdoc-only-tags";
import { removeRedundantTags } from "@/transformer/rules/remove-redundant-tags";
import { removeTypeBraces } from "@/transformer/rules/remove-type-braces";
import { renameTags } from "@/transformer/rules/rename-tags";
import { stripOptionalParamBrackets } from "@/transformer/rules/strip-optional-param-brackets";
import { stripPrefixTags } from "@/transformer/rules/strip-prefix-tags";
import { stripReturnPromise } from "@/transformer/rules/strip-return-promise";

export {
  addHyphenSeparator,
  convertAccessTags,
  convertFileOverview,
  dropBareTypeParam,
  escapeBareAtSign,
  fenceExampleBlocks,
  foldDottedParam,
  removeJsdocOnlyTags,
  removeRedundantTags,
  removeTypeBraces,
  renameTags,
  stripOptionalParamBrackets,
  stripPrefixTags,
  stripReturnPromise,
};

/**
 * All conversion rules in the exact order the pipeline applies them.
 */
export const RULES: readonly Rule[] = Object.freeze([
  fenceExampleBlocks,
  escapeBareAtSign,
  removeTypeBraces,
  stripOptionalParamBrackets,
  renameTags,
  stripReturnPromise,
  addHyphenSeparator,
  foldDottedParam,
  convertAccessTags,
  convertFileOverview,
  dropBareTypeParam,
  removeRedundantTags,
  removeJsdocOnlyTags,
  stripPrefixTags,
]);
