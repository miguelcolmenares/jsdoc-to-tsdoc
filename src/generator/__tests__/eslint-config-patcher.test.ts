import { describe, expect, it } from "vitest";

import {
  buildTsdocConfigSnippet,
  patchEslintFlatConfig,
} from "@/generator/eslint-config-patcher";

const defineConfigSource = [
  'import js from "@eslint/js";',
  "",
  "export default defineConfig([",
  "  js.configs.recommended,",
  "]);",
  "",
].join("\n");

describe("patchEslintFlatConfig", () => {
  it("inserts imports and the plugin block into a defineConfig array", () => {
    const result = patchEslintFlatConfig(defineConfigSource, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.content).toContain('import tsdoc from "eslint-plugin-tsdoc";');
    expect(result.content).toContain('import tsdocRequire from "eslint-plugin-tsdoc-require-2";');
    expect(result.content).toContain('"tsdoc/syntax": "error"');
    expect(result.content).toContain('"tsdoc-require-2/require": "warn"');
    expect(result.content).toContain('"tsdoc-require-2/require-param": "off"');
  });

  it("uses error severity in strict mode", () => {
    const result = patchEslintFlatConfig(defineConfigSource, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"tsdoc-require-2/require": "error"');
  });

  it("is idempotent when the config already references the plugin", () => {
    const first = patchEslintFlatConfig(defineConfigSource, { severity: "warn" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = patchEslintFlatConfig(first.content, { severity: "warn" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("patches a tseslint.config(...) call shape", () => {
    const source = [
      'import tseslint from "typescript-eslint";',
      "",
      "export default tseslint.config(",
      "  ...tseslint.configs.recommended,",
      ");",
    ].join("\n");

    const result = patchEslintFlatConfig(source, { severity: "warn" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"tsdoc/syntax": "error"');
  });

  it("completes a config that references only the presence plugin", () => {
    const source = [
      'import tsdocRequire from "eslint-plugin-tsdoc-require-2";',
      "",
      "export default defineConfig([",
      "  {",
      '    plugins: { "tsdoc-require-2": tsdocRequire },',
      '    rules: { "tsdoc-require-2/require": "warn" },',
      "  },",
      "]);",
    ].join("\n");

    const result = patchEslintFlatConfig(source, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The substring "eslint-plugin-tsdoc" is present, but the syntax plugin is
    // not — the patch must still run and add it.
    expect(result.changed).toBe(true);
    expect(result.content).toContain('import tsdoc from "eslint-plugin-tsdoc";');
    expect(result.content).toContain('"tsdoc/syntax": "error"');
    // The existing presence-plugin import must not be duplicated.
    const requireImports = result.content.match(
      /import tsdocRequire from "eslint-plugin-tsdoc-require-2";/g,
    );
    expect(requireImports).toHaveLength(1);
  });

  it("does not treat a comment mention of the plugin as already configured", () => {
    const source = [
      "// Reminder: enable eslint-plugin-tsdoc for TSDoc syntax validation.",
      'import js from "@eslint/js";',
      "",
      "export default defineConfig([",
      "  js.configs.recommended,",
      "]);",
    ].join("\n");

    const result = patchEslintFlatConfig(source, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The plugin name only appears in a comment — the config must still be patched.
    expect(result.changed).toBe(true);
    expect(result.content).toContain('import tsdoc from "eslint-plugin-tsdoc";');
  });

  it("ignores a commented-out container and patches the real one", () => {
    const source = [
      'import js from "@eslint/js";',
      "",
      "// Legacy: export default [oldConfig]",
      "export default defineConfig([",
      "  js.configs.recommended,",
      "]);",
    ].join("\n");

    const result = patchEslintFlatConfig(source, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The block is inserted after the real container, not the comment.
    expect(result.content).toContain("// Legacy: export default [oldConfig]");
    expect(result.content.indexOf('"tsdoc/syntax"')).toBeGreaterThan(
      result.content.indexOf("export default defineConfig("),
    );
    // The comment line is preserved verbatim (nothing injected right after it).
    expect(result.content).toContain(
      "// Legacy: export default [oldConfig]\nexport default defineConfig([",
    );
  });

  it("inserts after a multi-line, semicolon-less import block", () => {
    const source = [
      "import {",
      "  defineConfig,",
      "  globalIgnores,",
      '} from "eslint/config"',
      "",
      "export default defineConfig([",
      "  globalIgnores([]),",
      "])",
    ].join("\n");

    const result = patchEslintFlatConfig(source, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Imports land after the multi-line import, not prepended before it.
    expect(result.content.indexOf('import tsdoc from "eslint-plugin-tsdoc";')).toBeGreaterThan(
      result.content.indexOf('} from "eslint/config"'),
    );
    // The file does not start with the injected import.
    expect(result.content.startsWith("import {")).toBe(true);
  });

  it("returns a manual snippet when no config container is recognized", () => {
    const result = patchEslintFlatConfig("export const notAConfig = 1;\n", {
      severity: "warn",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.snippet).toContain("eslint-plugin-tsdoc");
  });
});

describe("buildTsdocConfigSnippet", () => {
  it("includes ESM imports, a CommonJS variant, and the rule block", () => {
    const snippet = buildTsdocConfigSnippet("warn");
    expect(snippet).toContain('import tsdoc from "eslint-plugin-tsdoc";');
    expect(snippet).toContain('const tsdoc = require("eslint-plugin-tsdoc");');
    expect(snippet).toContain('"tsdoc-require-2/require": "warn"');
  });
});
