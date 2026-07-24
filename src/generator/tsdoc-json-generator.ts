/**
 * Generation and merging of a project's `tsdoc.json` file.
 *
 * @remarks
 * `tsdoc.json` registers the custom block tags a project uses (`@since`, …) so
 * the `@microsoft/tsdoc` parser and `eslint-plugin-tsdoc` accept them instead of
 * flagging `tsdoc-undefined-tag`. Generation is pure text: it emits the minimal
 * valid document when there are no customs, and merges non-destructively into an
 * existing file when one is present.
 *
 * @since 0.1.0
 */

const TSDOC_SCHEMA_URL =
  "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json";

/**
 * The syntactic role a registered tag plays, mirroring the `tsdoc.json` schema.
 */
export type TagSyntaxKind = "block" | "inline" | "modifier";

/**
 * A single `tsdoc.json` tag definition.
 */
export interface TsdocTagDefinition {
  /** The tag token including its `@` (for example `@since`). */
  readonly tagName: string;
  /** The tag's syntactic role. */
  readonly syntaxKind: TagSyntaxKind;
}

interface TsdocJsonDocument {
  $schema?: string;
  tagDefinitions?: TsdocTagDefinition[];
  [key: string]: unknown;
}

/**
 * Serializes a `tsdoc.json` document to a stable, pretty-printed string with a
 * trailing newline.
 *
 * @param document - The document object to serialize.
 * @returns Two-space-indented JSON ending in a newline.
 */
function serialize(document: TsdocJsonDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Builds a fresh `tsdoc.json` document registering the given custom block tags.
 *
 * @param blockTags - Custom block tag tokens to register (for example `@since`).
 * Duplicates and order are normalized; an empty list yields the minimal document.
 * @returns The `tsdoc.json` file contents.
 */
export function generateTsdocJson(blockTags: readonly string[]): string {
  const unique = [...new Set(blockTags)].sort((a, b) => a.localeCompare(b));
  const document: TsdocJsonDocument = { $schema: TSDOC_SCHEMA_URL };
  if (unique.length > 0) {
    document.tagDefinitions = unique.map((tagName) => ({
      tagName,
      syntaxKind: "block",
    }));
  }
  return serialize(document);
}

/**
 * Merges custom block tags into an existing `tsdoc.json`, preserving unrelated
 * fields and any tag definitions already present.
 *
 * @param existing - The current `tsdoc.json` file contents.
 * @param blockTags - Custom block tag tokens to ensure are registered.
 * @returns The merged file contents, or a fresh document when `existing` is not
 * valid JSON.
 */
export function mergeTsdocJson(
  existing: string,
  blockTags: readonly string[],
): string {
  let document: TsdocJsonDocument;
  try {
    const parsed = JSON.parse(existing) as unknown;
    // Only a plain object is a usable document. Arrays, `null`, and primitives
    // are valid JSON but invalid `tsdoc.json`, and assigning `$schema` /
    // `tagDefinitions` onto them would serialize to nothing — regenerate instead.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return generateTsdocJson(blockTags);
    }
    document = parsed as TsdocJsonDocument;
  } catch {
    return generateTsdocJson(blockTags);
  }

  if (typeof document.$schema !== "string") {
    document.$schema = TSDOC_SCHEMA_URL;
  }

  const definitions = Array.isArray(document.tagDefinitions)
    ? [...document.tagDefinitions]
    : [];
  // Existing entries are unvalidated JSON: guard against `null`, primitives, or
  // objects without a `tagName` so a partially-invalid file cannot crash the
  // merge. Malformed entries are preserved as-is; only valid names gate dedup.
  const known = new Set(
    definitions
      .filter(
        (definition): definition is TsdocTagDefinition =>
          typeof definition === "object" &&
          definition !== null &&
          typeof (definition as { tagName?: unknown }).tagName === "string",
      )
      .map((definition) => definition.tagName),
  );

  for (const tagName of blockTags) {
    if (!known.has(tagName)) {
      definitions.push({ tagName, syntaxKind: "block" });
      known.add(tagName);
    }
  }

  if (definitions.length > 0) {
    document.tagDefinitions = definitions;
  }

  return serialize(document);
}
