/**
 * Reference sets describing which tags the TSDoc standard defines and which are
 * project-specific customs that need registering in `tsdoc.json`.
 *
 * @remarks
 * `init` consumes these to classify the block tags it finds in a project: a
 * standard tag needs no configuration, a well-known custom tag (`@since`,
 * `@author`, `@version`) is registered automatically, and anything else is
 * surfaced for a human decision. Kept in the generator domain because tag
 * *registration* is a bootstrapping concern; the JSDoc → TSDoc *conversion*
 * tables live in `@/parser`.
 *
 * @since 0.1.0
 */

/**
 * Block tags defined by the TSDoc standard. Their presence is always valid, so
 * they never require a `tsdoc.json` definition.
 *
 * @see {@link https://tsdoc.org/pages/tags/alpha/ | TSDoc tag reference}
 */
export const STANDARD_TSDOC_BLOCK_TAGS: readonly string[] = Object.freeze([
  "@decorator",
  "@defaultValue",
  "@deprecated",
  "@example",
  "@label",
  "@param",
  "@privateRemarks",
  "@remarks",
  "@returns",
  "@see",
  "@throws",
  "@typeParam",
]);

/**
 * Modifier tags defined by the TSDoc standard (release-stage and member
 * modifiers). Like block tags, they need no registration.
 */
export const STANDARD_TSDOC_MODIFIER_TAGS: readonly string[] = Object.freeze([
  "@alpha",
  "@beta",
  "@eventProperty",
  "@experimental",
  "@internal",
  "@override",
  "@packageDocumentation",
  "@public",
  "@readonly",
  "@sealed",
  "@virtual",
]);

/**
 * Inline tags defined by the TSDoc standard.
 */
export const STANDARD_TSDOC_INLINE_TAGS: readonly string[] = Object.freeze([
  "@inheritDoc",
  "@link",
]);

/**
 * Custom block tags that appeared across every real-world migration and carry
 * an unambiguous block syntax. `init` registers these automatically rather than
 * prompting, matching the observed dominance of `@since` in practice.
 */
export const KNOWN_CUSTOM_BLOCK_TAGS: readonly string[] = Object.freeze([
  "@author",
  "@since",
  "@version",
]);

/**
 * How a tag encountered in a project relates to the TSDoc standard.
 *
 * @remarks
 * - `standard` — part of the TSDoc spec; no action needed.
 * - `custom` — a recognized project custom (registered as a block tag).
 * - `pragma` — not a TSDoc tag at all: a hyphenated token another tool reads
 *   out of the same comment, such as Jest's `@jest-environment`.
 * - `unknown` — neither; reported for a human to register or remove.
 */
export type TagClassification = "standard" | "custom" | "pragma" | "unknown";

const STANDARD_TAGS: ReadonlySet<string> = new Set([
  ...STANDARD_TSDOC_BLOCK_TAGS,
  ...STANDARD_TSDOC_MODIFIER_TAGS,
  ...STANDARD_TSDOC_INLINE_TAGS,
]);

const KNOWN_CUSTOM_TAGS: ReadonlySet<string> = new Set(KNOWN_CUSTOM_BLOCK_TAGS);

// A tag-shaped token carrying a hyphen: word characters and hyphens only, with
// at least one hyphen and no `/` or `.`. TSDoc tag names are letters and digits
// exclusively, so anything matching this is definitionally not a TSDoc tag —
// while the slash-bearing shapes a path alias and a scoped package take are
// excluded, since those are prose hazards rather than pragmas.
const PRAGMA_TAG = /^@[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

/**
 * Classifies a single tag token against the TSDoc standard.
 *
 * @remarks
 * Comparison is case-insensitive on the tag name but preserves the canonical
 * spelling in the reference sets (TSDoc tag names are case-sensitive in output,
 * so `@inheritdoc` and `@inheritDoc` both classify as standard here).
 *
 * @param tag - A tag token including its leading `@` (for example `@since`).
 * @returns Whether the tag is standard, a known custom, or unknown.
 */
export function classifyTag(tag: string): TagClassification {
  const normalized = tag.toLowerCase();
  // A pragma another tool reads out of the same comment —
  // `@jest-environment`, `@vitest-environment`, `@ts-check` in a block
  // comment. Registering one in `tsdoc.json` would declare a documentation tag
  // that is not one; removing it would break the tool that reads it. Neither
  // is a decision to put in front of a user, so it is classified rather than
  // reported.
  //
  // A hyphen alone is not the test. A path alias (`@/lib/ccds-api`) and a
  // scoped package (`@scope/pkg-name`) also carry one, and both must keep
  // classifying as `unknown` so `escapeBareAtSign` still backticks them —
  // treating a hyphen as sufficient silently stopped it doing that.
  if (PRAGMA_TAG.test(normalized)) {
    return "pragma";
  }
  for (const standard of STANDARD_TAGS) {
    if (standard.toLowerCase() === normalized) {
      return "standard";
    }
  }
  for (const custom of KNOWN_CUSTOM_TAGS) {
    if (custom.toLowerCase() === normalized) {
      return "custom";
    }
  }
  return "unknown";
}
