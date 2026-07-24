/**
 * Non-destructive text patching of an ESLint flat config to add the TSDoc
 * plugins and rules.
 *
 * @remarks
 * Flat configs come in several shapes (`defineConfig([…])`,
 * `tseslint.config(…)`, a bare `export default [ … ]`, or a `const` assigned and
 * then exported). Rather than parse and re-print an AST — which would lose the
 * author's formatting — this inserts two `import` lines after the existing
 * imports and a plugin/rules block as the first entry of the config container.
 * The patch is idempotent: a config that already references
 * `eslint-plugin-tsdoc` is returned unchanged. When no known container shape is
 * recognized, the result carries a copy-pasteable snippet for manual insertion.
 *
 * @since 0.1.0
 */

/**
 * The starting severity of the presence rule: `warn` for the progressive
 * default, `error` for a strict lock-in from day one.
 */
export type Severity = "warn" | "error";

/**
 * Options controlling {@link patchEslintFlatConfig}.
 */
export interface PatchEslintOptions {
  /** Severity applied to `tsdoc-require-2/require`. */
  readonly severity: Severity;
}

/**
 * The outcome of a patch attempt: either updated content, or a failure carrying
 * a manual-insertion snippet.
 */
export type EslintPatchResult =
  | { readonly ok: true; readonly content: string; readonly changed: boolean }
  | { readonly ok: false; readonly reason: string; readonly snippet: string };

const TSDOC_IMPORTS = [
  'import tsdoc from "eslint-plugin-tsdoc";',
  'import tsdocRequire from "eslint-plugin-tsdoc-require-2";',
].join("\n");

/**
 * Regexes matching the opening bracket of a recognized config container. The
 * match end is the insertion point for the plugin block.
 */
const CONTAINER_OPENERS: readonly RegExp[] = [
  /export\s+default\s+defineConfig\s*\(\s*\[/,
  /export\s+default\s+tseslint\.config\s*\(/,
  /export\s+default\s+\[/,
  /(?:const|let|var)\s+\w+\s*=\s*defineConfig\s*\(\s*\[/,
  /(?:const|let|var)\s+\w+\s*=\s*tseslint\.config\s*\(/,
];

/**
 * Renders the plugin/rules block inserted as the first config entry.
 *
 * @param severity - Severity for the presence rule.
 * @returns The two-object block (source rules + test-file overrides), indented.
 */
function buildConfigBlock(severity: Severity): string {
  return [
    "  {",
    '    files: ["src/**/*.ts", "src/**/*.tsx"],',
    "    plugins: {",
    "      tsdoc,",
    '      "tsdoc-require-2": tsdocRequire,',
    "    },",
    "    rules: {",
    '      "tsdoc/syntax": "error",',
    `      "tsdoc-require-2/require": "${severity}",`,
    '      "tsdoc-require-2/require-param": "off",',
    '      "tsdoc-require-2/require-returns": "off",',
    "    },",
    "  },",
    "  {",
    '    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],',
    "    rules: {",
    '      "tsdoc/syntax": "off",',
    '      "tsdoc-require-2/require": "off",',
    "    },",
    "  },",
  ].join("\n");
}

/**
 * Builds the full copy-pasteable snippet (imports plus config block) for manual
 * insertion when automatic patching cannot locate the config container.
 *
 * @param severity - Severity for the presence rule.
 * @returns The imports and config block joined for display.
 */
export function buildTsdocConfigSnippet(severity: Severity): string {
  return `${TSDOC_IMPORTS}\n\n// Add inside your exported config array:\n${buildConfigBlock(severity)}`;
}

/**
 * Inserts the TSDoc imports after the last top-level `import` statement.
 *
 * @param source - The config source.
 * @returns The source with the imports inserted (or prepended if none exist).
 */
function insertImports(source: string): string {
  const importLine = /^import[^\n]*?;[ \t]*$/gm;
  let lastEnd = -1;
  for (let match = importLine.exec(source); match; match = importLine.exec(source)) {
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd === -1) {
    return `${TSDOC_IMPORTS}\n${source}`;
  }
  return `${source.slice(0, lastEnd)}\n${TSDOC_IMPORTS}${source.slice(lastEnd)}`;
}

/**
 * Finds the offset just after the config container's opening bracket.
 *
 * @param source - The config source.
 * @returns The insertion offset, or `-1` when no known shape is found.
 */
function findContainerInsertPoint(source: string): number {
  let earliest = -1;
  for (const opener of CONTAINER_OPENERS) {
    const match = opener.exec(source);
    if (match) {
      const end = match.index + match[0].length;
      if (earliest === -1 || match.index < earliest) {
        earliest = end;
      }
    }
  }
  return earliest;
}

/**
 * Patches an ESLint flat config to enable the TSDoc syntax and presence rules.
 *
 * @param source - The current flat-config file contents.
 * @param options - Patch options (starting severity).
 * @returns An {@link EslintPatchResult}: updated content, an unchanged no-op when
 * already patched, or a failure with a manual snippet.
 */
export function patchEslintFlatConfig(
  source: string,
  options: PatchEslintOptions,
): EslintPatchResult {
  if (source.includes("eslint-plugin-tsdoc")) {
    return { ok: true, content: source, changed: false };
  }

  const withImports = insertImports(source);
  const insertAt = findContainerInsertPoint(withImports);
  if (insertAt === -1) {
    return {
      ok: false,
      reason: "Could not locate the exported ESLint config array.",
      snippet: buildTsdocConfigSnippet(options.severity),
    };
  }

  const block = buildConfigBlock(options.severity);
  const content = `${withImports.slice(0, insertAt)}\n${block}${withImports.slice(insertAt)}`;
  return { ok: true, content, changed: true };
}
