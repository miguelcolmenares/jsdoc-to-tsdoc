/**
 * JSDoc → TSDoc tag mapping tables.
 *
 * @remarks
 * The single source of truth for how each JSDoc tag is treated during
 * conversion. Transformer rules consume these frozen tables rather than
 * hard-coding tag names, so adding or reclassifying a tag is a one-line change
 * here. Every collection is deep-frozen to guarantee the determinism the
 * pipeline relies on.
 *
 * @since 0.1.0
 */

/**
 * JSDoc block tags that map one-to-one onto a differently-named TSDoc tag with
 * identical semantics. Only the tag name changes; its argument is preserved.
 */
export const TAG_RENAMES: Readonly<Record<string, string>> = Object.freeze({
  "@return": "@returns",
  "@template": "@typeParam",
  "@default": "@defaultValue",
  "@yield": "@returns",
  "@yields": "@returns",
});

/**
 * JSDoc access tags mapped onto the equivalent TSDoc release/visibility
 * modifier. `@access package` collapses to `@internal` since TSDoc has no
 * package-visibility concept.
 */
export const ACCESS_MODIFIERS: Readonly<Record<string, string>> = Object.freeze({
  private: "@internal",
  package: "@internal",
  protected: "@protected",
  public: "@public",
});

/**
 * JSDoc tags with no meaning in TSDoc because TypeScript's own syntax already
 * expresses them. The entire tag line is removed during conversion.
 */
export const REDUNDANT_TAGS: readonly string[] = Object.freeze([
  "@function",
  "@func",
  "@method",
  "@async",
  "@class",
  "@constructor",
  "@interface",
  "@enum",
  "@export",
  "@augments",
  "@extends",
  "@implements",
  "@virtual",
  "@abstract",
  "@global",
  "@instance",
  "@static",
]);

/**
 * JSDoc-only tags with no TSDoc equivalent whose entire line is removed. The
 * shapes they described are expressed by TypeScript `type` / `interface`
 * declarations instead.
 */
export const JSDOC_ONLY_TAGS: readonly string[] = Object.freeze([
  "@typedef",
  "@callback",
  "@type",
  "@property",
  "@prop",
]);

/**
 * JSDoc tags whose descriptive text should survive as the comment summary; only
 * the tag prefix is stripped, leaving the prose in place.
 */
export const PREFIX_ONLY_TAGS: readonly string[] = Object.freeze([
  "@description",
  "@desc",
  "@classdesc",
]);

/**
 * JSDoc file-level tags that become the TSDoc `@packageDocumentation` modifier.
 * Any argument (a module path, an overview sentence) is relocated to the
 * summary rather than kept on the tag, which TSDoc does not allow.
 */
export const PACKAGE_DOC_TAGS: readonly string[] = Object.freeze([
  "@fileoverview",
  "@file",
  "@overview",
  "@module",
]);

/**
 * Extracts the leading block-tag token (for example `@param`) from a content
 * line, if the line begins with one.
 *
 * @param content - A comment content line, already stripped of its ` * ` prefix.
 * @returns The lowercased tag including its `@`, or `undefined` when the line is
 * not a block tag.
 */
export function leadingTag(content: string): string | undefined {
  const match = /^\s*(@[a-zA-Z]+)/.exec(content);
  return match?.[1]?.toLowerCase();
}

/**
 * Reports whether a tag's entire line should be removed during conversion.
 *
 * @param tag - A tag token including its `@` (case-insensitive).
 * @returns `true` for redundant or JSDoc-only tags.
 */
export function isRemovableTag(tag: string): boolean {
  const normalized = tag.toLowerCase();
  return (
    REDUNDANT_TAGS.includes(normalized) || JSDOC_ONLY_TAGS.includes(normalized)
  );
}
