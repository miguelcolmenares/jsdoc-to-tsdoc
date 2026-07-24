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
 * The patch is idempotent: a config that already references the
 * `eslint-plugin-tsdoc` syntax plugin is returned unchanged (a config that has
 * only the presence plugin is still completed). When no known container shape is
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

// The closing quote right after `eslint-plugin-tsdoc` makes these match the
// exact package, never the longer `eslint-plugin-tsdoc-require-2`. Matching an
// actual `import`/`require` of the package — rather than a bare substring —
// avoids a false "already configured" verdict when the name only appears in a
// comment or string literal.
const SYNTAX_PLUGIN_IMPORT = /from\s+["']eslint-plugin-tsdoc["']/;
const SYNTAX_PLUGIN_REQUIRE = /require\(\s*["']eslint-plugin-tsdoc["']\s*\)/;
const REQUIRE_PLUGIN_IMPORT = /from\s+["']eslint-plugin-tsdoc-require-2["']/;

/**
 * Reports whether a config already imports or requires the `eslint-plugin-tsdoc`
 * syntax plugin — the signal that the config is already set up. A config that
 * references only the presence plugin (`-require-2`) is not considered set up,
 * so it is still completed with the missing syntax plugin.
 *
 * @param source - The config source.
 * @returns `true` when the syntax plugin is imported or required.
 */
function hasSyntaxPlugin(source: string): boolean {
  return SYNTAX_PLUGIN_IMPORT.test(source) || SYNTAX_PLUGIN_REQUIRE.test(source);
}

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
 * Builds the import lines still missing from a config, so a partially-configured
 * project is not given a duplicate import.
 *
 * @param source - The config source.
 * @returns The needed `import` lines joined by newlines (possibly empty).
 */
function missingImports(source: string): string {
  const lines: string[] = [];
  if (!SYNTAX_PLUGIN_IMPORT.test(source)) {
    lines.push('import tsdoc from "eslint-plugin-tsdoc";');
  }
  if (!REQUIRE_PLUGIN_IMPORT.test(source)) {
    lines.push('import tsdocRequire from "eslint-plugin-tsdoc-require-2";');
  }
  return lines.join("\n");
}

/**
 * Inserts the missing TSDoc imports after the last top-level `import` statement.
 *
 * @param source - The config source.
 * @returns The source with the imports inserted (or prepended if none exist).
 */
function insertImports(source: string): string {
  const imports = missingImports(source);
  if (imports === "") {
    return source;
  }
  const importLine = /^import[^\n]*?;[ \t]*$/gm;
  let lastEnd = -1;
  for (let match = importLine.exec(source); match; match = importLine.exec(source)) {
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd === -1) {
    return `${imports}\n${source}`;
  }
  return `${source.slice(0, lastEnd)}\n${imports}${source.slice(lastEnd)}`;
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
  if (hasSyntaxPlugin(source)) {
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
