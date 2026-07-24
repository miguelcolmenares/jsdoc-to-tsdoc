/**
 * @packageDocumentation
 * The ordered set of JSDoc → TSDoc conversion rules.
 *
 * Order matters: type braces are stripped and tags renamed before separators
 * are inserted, and structural line removals run last so earlier rules see the
 * full comment. `RULES` is frozen to keep the pipeline deterministic.
 *
 * @since 0.1.0
 */

import type { Rule } from "@/transformer/pipeline";

import { addHyphenSeparator } from "@/transformer/rules/add-hyphen-separator";
import { convertAccessTags } from "@/transformer/rules/convert-access-tags";
import { convertFileOverview } from "@/transformer/rules/convert-file-overview";
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
  removeTypeBraces,
  stripOptionalParamBrackets,
  renameTags,
  stripReturnPromise,
  addHyphenSeparator,
  convertAccessTags,
  convertFileOverview,
  removeRedundantTags,
  removeJsdocOnlyTags,
  stripPrefixTags,
]);
