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
  it("includes imports and the rule block", () => {
    const snippet = buildTsdocConfigSnippet("warn");
    expect(snippet).toContain('import tsdoc from "eslint-plugin-tsdoc";');
    expect(snippet).toContain('"tsdoc-require-2/require": "warn"');
  });
});
