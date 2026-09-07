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

import { readConfigLines } from "@/generator/config-source";

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

/**
 * The paths `init` exempts from the TSDoc rules.
 *
 * @remarks
 * Test files hold intentionally malformed fixtures and export helpers nobody
 * consumes, so both the syntax and the presence rule are turned off for them in
 * the generated config. `check` reads the same list, so the gate never reports a
 * file the configuration it scaffolds would have excused.
 */
export const TEST_FILE_GLOBS: readonly string[] = Object.freeze([
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__tests__/**",
]);

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

// Matches `"tsdoc/syntax"` only when it is set to an *enabled* severity — a
// quoted `error`/`warn` or the numeric `1`/`2`, optionally as the first element
// of an `[severity, options]` tuple. A mere mention or an explicit `"off"` / `0`
// (for example in a test override) must not count as "rule already enabled",
// otherwise the patch would no-op and never add the real source-file rule.
const SYNTAX_RULE_ENABLED =
  /["']tsdoc\/syntax["']\s*:\s*\[?\s*(?:["'](?:error|warn)["']|[12]\b)/;

/**
 * Tests a pattern against the source while ignoring comments, so a commented-out
 * `import`/`require` (for example `// import … "eslint-plugin-tsdoc"`, or the
 * same inside a `/* … *\/` block that opened mid-line) is never mistaken for a
 * real reference.
 *
 * @param source - The config source.
 * @param pattern - The regex to test against the comment-free form of each line.
 * @returns `true` when any line matches outside its comments.
 */
function testInCode(source: string, pattern: RegExp): boolean {
  return readConfigLines(source).some((line) => pattern.test(line.code));
}

/**
 * Reports whether a config already imports or requires the `eslint-plugin-tsdoc`
 * syntax plugin — the signal that the config is already set up. A config that
 * references only the presence plugin (`-require-2`) is not considered set up,
 * so it is still completed with the missing syntax plugin.
 *
 * @param source - The config source.
 * @returns `true` when the syntax plugin is imported or required in real code.
 */
function hasSyntaxPlugin(source: string): boolean {
  return (
    testInCode(source, SYNTAX_PLUGIN_IMPORT) ||
    testInCode(source, SYNTAX_PLUGIN_REQUIRE)
  );
}

/**
 * Reports whether the `tsdoc/syntax` rule is actually enabled in real code — the
 * signal that TSDoc linting is wired up, not merely that the plugin is imported.
 * A rule that is only mentioned or explicitly disabled (`"off"` / `0`) does not
 * count, so a config that turns the rule off does not block completion.
 *
 * @param source - The config source.
 * @returns `true` when the `tsdoc/syntax` rule is set to an enabled severity
 * outside of comments.
 */
function hasSyntaxRule(source: string): boolean {
  return testInCode(source, SYNTAX_RULE_ENABLED);
}

/**
 * Regexes matching the opening bracket of a recognized config container. The
 * match end is the insertion point for the plugin block. Each is anchored to a
 * line start (`^[ \t]*`, multiline) so a mention inside a comment or string
 * (for example `// export default [`) is never mistaken for the real container.
 */
const CONTAINER_OPENERS: readonly RegExp[] = [
  /^[ \t]*export\s+default\s+defineConfig\s*\(\s*\[/m,
  /^[ \t]*export\s+default\s+tseslint\.config\s*\(/m,
  /^[ \t]*export\s+default\s+\[/m,
  /^[ \t]*(?:const|let|var)\s+\w+\s*=\s*defineConfig\s*\(\s*\[/m,
  /^[ \t]*(?:const|let|var)\s+\w+\s*=\s*tseslint\.config\s*\(/m,
  // The variadic `defineConfig(a, b, c)` form — ESLint's own documented API,
  // not a stylistic variant. The negative lookahead keeps it from also
  // matching the array form above, which needs a different insertion offset
  // (past the `[`, not past the `(`). Both produce the same result from the
  // block: it renders as bare `{…},` entries, which are equally valid as
  // array elements and as leading arguments.
  /^[ \t]*export\s+default\s+defineConfig\s*\((?!\s*\[)/m,
  /^[ \t]*(?:const|let|var)\s+\w+\s*=\s*defineConfig\s*\((?!\s*\[)/m,
];

/**
 * Matches `export default someIdentifier`, capturing the identifier.
 *
 * @remarks
 * Anchored to a line start so a mention inside a comment or string is not
 * mistaken for the real export, and excludes the shapes the openers above
 * already handle by requiring the whole statement to be just a name.
 */
const DEFAULT_EXPORT_IDENTIFIER = /^[ \t]*export\s+default\s+(\w+)\s*;?\s*$/m;

/**
 * Finds the insertion point for a bare array assigned to a variable that is
 * then default-exported — the shape `create-next-app` scaffolds:
 *
 * ```text
 * const eslintConfig = [ … ];
 * export default eslintConfig;
 * ```
 *
 * @remarks
 * Deliberately not a `CONTAINER_OPENERS` entry. `const \w+ = [` on its own is
 * far broader than the wrapper-call patterns and would happily match an
 * unrelated array declared above the real config — a shared `ignores` list, a
 * list of paths. Anchoring on the identifier that is actually exported makes
 * the match unambiguous, and means a file with several arrays still resolves
 * to the right one.
 *
 * @param source - The config source.
 * @returns The offset just past the array's `[`, or `-1` when the file does
 *          not have this shape.
 */
function findExportedArrayInsertPoint(source: string): number {
  const exported = DEFAULT_EXPORT_IDENTIFIER.exec(source);
  if (!exported) {
    return -1;
  }
  const name = exported[1];
  if (name === undefined) {
    return -1;
  }
  const declaration = new RegExp(
    `^[ \\t]*(?:const|let|var)\\s+${name}\\s*=\\s*\\[`,
    "m",
  ).exec(source);
  return declaration === null ? -1 : declaration.index + declaration[0].length;
}

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
    `    files: [${TEST_FILE_GLOBS.map((glob) => `"${glob}"`).join(", ")}],`,
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
  const cjs = [
    'const tsdoc = require("eslint-plugin-tsdoc");',
    'const tsdocRequire = require("eslint-plugin-tsdoc-require-2");',
  ].join("\n");
  return [
    "// ESM (eslint.config.mjs / .js):",
    TSDOC_IMPORTS,
    "",
    "// CommonJS (eslint.config.cjs):",
    cjs,
    "",
    "// Then add inside your exported config array:",
    buildConfigBlock(severity),
  ].join("\n");
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
  if (!testInCode(source, SYNTAX_PLUGIN_IMPORT)) {
    lines.push('import tsdoc from "eslint-plugin-tsdoc";');
  }
  if (!testInCode(source, REQUIRE_PLUGIN_IMPORT)) {
    lines.push('import tsdocRequire from "eslint-plugin-tsdoc-require-2";');
  }
  return lines.join("\n");
}

const FROM_SOURCE = /\bfrom\s+["'][^"']*["']/;
const SIDE_EFFECT_IMPORT = /^import\s+["'][^"']*["']/;

/**
 * Finds the character offset just past the last top-level `import` statement,
 * tolerating semicolon-less style, side-effect imports, and multi-line imports
 * (which a single-line regex would miss, causing the TSDoc imports to be
 * wrongly prepended ahead of leading comments or directives).
 *
 * @param source - The config source.
 * @returns The offset after the last import's final line, or `-1` when none.
 */
function findLastImportOffset(source: string): number {
  const lines = source.split("\n");
  let offset = 0;
  let lastEnd = -1;
  let inMultiLineImport = false;

  for (const line of lines) {
    const contentEnd = offset + line.length;
    const trimmed = line.trim();

    if (inMultiLineImport) {
      if (FROM_SOURCE.test(trimmed)) {
        inMultiLineImport = false;
        lastEnd = contentEnd;
      }
    } else if (/^import\b/.test(trimmed)) {
      if (FROM_SOURCE.test(trimmed) || SIDE_EFFECT_IMPORT.test(trimmed)) {
        lastEnd = contentEnd;
      } else {
        inMultiLineImport = true;
      }
    }

    offset = contentEnd + 1;
  }

  return lastEnd;
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
  const lastEnd = findLastImportOffset(source);
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
  let earliestIndex = -1;
  for (const opener of CONTAINER_OPENERS) {
    const match = opener.exec(source);
    if (match) {
      const end = match.index + match[0].length;
      if (earliestIndex === -1 || match.index < earliestIndex) {
        earliestIndex = match.index;
        earliest = end;
      }
    }
  }
  if (earliest !== -1) {
    return earliest;
  }
  // Last, because it is the loosest match: only reached when no wrapper-call
  // or inline-array shape was recognized.
  return findExportedArrayInsertPoint(source);
}

/**
 * Patches an ESLint flat config to enable the TSDoc syntax and presence rules.
 *
 * @param source - The current flat-config file contents.
 * @param options - Patch options (starting severity).
 * @returns An {@link EslintPatchResult}: updated content, an unchanged no-op when
 * the syntax plugin is imported and the `tsdoc/syntax` rule is already enabled,
 * or a failure with a manual snippet.
 */
export function patchEslintFlatConfig(
  source: string,
  options: PatchEslintOptions,
): EslintPatchResult {
  // Only a config that both imports the syntax plugin AND enables the
  // `tsdoc/syntax` rule is fully set up. Gating the no-op on the import alone
  // would wrongly leave a config that imports the plugin but never enabled the
  // rules unpatched, so `init` would fail to bootstrap linting. `insertImports`
  // is idempotent, so completing such a config adds the rules block without
  // duplicating the existing import.
  if (hasSyntaxPlugin(source) && hasSyntaxRule(source)) {
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
  const suffix = withImports.slice(insertAt);
  // Keep the container's closing bracket on its own line. For one-line
  // containers (`export default [];`) the suffix (`];`) would otherwise glue
  // onto the block's last line as `  },];`.
  const separator = suffix.startsWith("\n") ? "" : "\n";
  const content = `${withImports.slice(0, insertAt)}\n${block}${separator}${suffix}`;
  return { ok: true, content, changed: true };
}
