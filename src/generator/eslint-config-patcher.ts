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
const SYNTAX_RULE = /["']tsdoc\/syntax["']/;

/**
 * Tests a pattern against the source while ignoring comments, so a commented-out
 * `import`/`require` (for example `// import … "eslint-plugin-tsdoc"`, or the
 * same inside a multi-line `/* … *\/` block) is never mistaken for a real
 * reference. A line-by-line block-comment state machine is used rather than a
 * global `/* … *\/` strip, because a naive strip would also eat the `/*`…`*\/`
 * that appear inside common glob strings such as `"src/**\/*.ts"`.
 *
 * @param source - The config source.
 * @param pattern - The regex to test against each non-comment line.
 * @returns `true` when any code line matches.
 */
function testInCode(source: string, pattern: RegExp): boolean {
  let inBlockComment = false;
  return source.split("\n").some((line) => {
    const trimmed = line.trim();
    if (inBlockComment) {
      // A `*/` anywhere on the line closes the block; whatever trails it is rare
      // enough in a flat config that the whole line stays treated as a comment.
      if (trimmed.includes("*/")) inBlockComment = false;
      return false;
    }
    if (trimmed.startsWith("/*")) {
      // Enter a block comment unless it also closes on the same line.
      if (!trimmed.includes("*/")) inBlockComment = true;
      return false;
    }
    if (trimmed.startsWith("//")) {
      return false;
    }
    return pattern.test(trimmed);
  });
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
 *
 * @param source - The config source.
 * @returns `true` when the `tsdoc/syntax` rule appears outside of comments.
 */
function hasSyntaxRule(source: string): boolean {
  return testInCode(source, SYNTAX_RULE);
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
