import { describe, expect, it } from "vitest";

import { updateRuleSeverity } from "@/escalator/rule-updater";

const config = (rules: readonly string[]): string =>
  [
    'import tsdoc from "eslint-plugin-tsdoc";',
    "",
    "export default [",
    "  {",
    '    files: ["src/**/*.ts"],',
    "    rules: {",
    ...rules.map((rule) => `      ${rule}`),
    "    },",
    "  },",
    "];",
    "",
  ].join("\n");

describe("updateRuleSeverity", () => {
  it("rewrites warn to error and reports the occurrence", () => {
    const source = config(['"tsdoc-require-2/require": "warn",']);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.content).toContain('"tsdoc-require-2/require": "error",');
    expect(result.occurrences).toEqual([{ line: 7, from: "warn" }]);
  });

  it("leaves the sibling require-param and require-returns rules alone", () => {
    const source = config([
      '"tsdoc-require-2/require": "warn",',
      '"tsdoc-require-2/require-param": "off",',
      '"tsdoc-require-2/require-returns": "off",',
    ]);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"tsdoc-require-2/require-param": "off",');
    expect(result.content).toContain('"tsdoc-require-2/require-returns": "off",');
    expect(result.occurrences).toHaveLength(1);
  });

  it("never switches an explicit off on", () => {
    // The test-file override `init` writes. Escalating it would enable the
    // presence rule exactly where the project chose to exempt itself.
    const source = [
      config(['"tsdoc-require-2/require": "warn",']),
      "const testOverrides = {",
      '  rules: { "tsdoc-require-2/require": "off" },',
      "};",
      "",
    ].join("\n");
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"tsdoc-require-2/require": "off"');
    expect(result.occurrences).toHaveLength(1);
  });

  it("fails when every assignment is off", () => {
    const source = config(['"tsdoc-require-2/require": "off",']);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/disabled everywhere/);
  });

  it("updates every enabled assignment across config blocks", () => {
    const source = [
      config(['"tsdoc-require-2/require": "warn",']),
      "export const extra = {",
      "  rules: {",
      '    "tsdoc-require-2/require": "warn",',
      "  },",
      "};",
      "",
    ].join("\n");
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.occurrences.map((entry) => entry.line)).toEqual([7, 14]);
    expect(result.content).not.toContain('"warn"');
  });

  it("preserves single quotes and the tuple form", () => {
    const source = config(["'tsdoc-require-2/require': ['warn', { skip: [] }],"]);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain(
      "'tsdoc-require-2/require': ['error', { skip: [] }],",
    );
  });

  it("keeps numeric severities numeric", () => {
    const source = config(['"tsdoc-require-2/require": 1,']);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('"tsdoc-require-2/require": 2,');
    expect(result.occurrences[0]?.from).toBe("warn");
  });

  it("does not match a longer numeric literal", () => {
    // `10` is not a severity; rewriting its leading `1` would corrupt the config.
    const source = config(['"tsdoc-require-2/require": 10,']);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/could not read its severity/);
  });

  it("ignores a commented-out assignment", () => {
    const source = [
      "export default [",
      "  {",
      "    rules: {",
      '      // "tsdoc-require-2/require": "warn",',
      "    },",
      "  },",
      "];",
      "",
    ].join("\n");
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not configured/);
    expect(result.reason).toMatch(/init/);
  });

  it("ignores an assignment inside a block comment", () => {
    const source = [
      "/*",
      ' "tsdoc-require-2/require": "warn",',
      "*/",
      "export default [];",
      "",
    ].join("\n");
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not configured/);
  });

  it("ignores an assignment inside a block comment that opened mid-line", () => {
    // Rewriting here would report a successful escalation while the real rule
    // stayed at warn — the config would be written back effectively unchanged.
    const source = [
      "export default [ /* disabled for now",
      '  "tsdoc-require-2/require": "warn",',
      "*/ ];",
      "",
    ].join("\n");
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not configured/);
  });

  it("ignores an assignment quoted in a trailing line comment", () => {
    const source = 'const note = 1; // "tsdoc-require-2/require": "warn"\n';
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not configured/);
  });

  it("rewrites the real assignment and not the one in the trailing comment", () => {
    const source = config([
      '"tsdoc-require-2/require": "warn", // was "tsdoc-require-2/require": "off"',
    ]);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.occurrences).toHaveLength(1);
    expect(result.content).toContain(
      '"tsdoc-require-2/require": "error", // was "tsdoc-require-2/require": "off"',
    );
  });

  it("reports changed=false when the target severity is already set", () => {
    const source = config(['"tsdoc-require-2/require": "error",']);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(result.content).toBe(source);
    expect(result.occurrences).toEqual([{ line: 7, from: "error" }]);
  });

  it("walks an escalation back to warn", () => {
    const source = config(['"tsdoc-require-2/require": "error",']);
    const result = updateRuleSeverity(source, { severity: "warn" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.content).toContain('"tsdoc-require-2/require": "warn",');
  });

  it("preserves every other byte of the config", () => {
    const source = config([
      '"tsdoc/syntax": "error",',
      '"tsdoc-require-2/require": "warn",',
    ]);
    const result = updateRuleSeverity(source, { severity: "error" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      source.replace(
        '"tsdoc-require-2/require": "warn",',
        '"tsdoc-require-2/require": "error",',
      ),
    );
  });
});
