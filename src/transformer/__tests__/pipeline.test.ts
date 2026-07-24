import { describe, expect, it } from "vitest";

import { runPipeline } from "@/transformer";

const comment = (...lines: string[]): string => lines.join("\n");

describe("runPipeline", () => {
  it("reports no change for an already-valid TSDoc comment", () => {
    const input = comment(
      "/**",
      " * Formats a value.",
      " *",
      " * @param value - The value to format.",
      " * @returns The formatted value.",
      " */",
    );

    const result = runPipeline(input, { lite: false });

    expect(result.changed).toBe(false);
    expect(result.output).toBe(input);
    expect(result.appliedRules).toEqual([]);
  });

  it("applies the full JSDoc → TSDoc conversion", () => {
    const input = comment(
      "/**",
      " * @module lib/widget",
      " * @param {string} name The widget name",
      " * @return {Widget} the widget",
      " * @async",
      " * @typedef {Object} Foo",
      " */",
    );

    const result = runPipeline(input, { lite: false });

    expect(result.changed).toBe(true);
    expect(result.output).toBe(
      comment(
        "/**",
        " * @packageDocumentation",
        " * @param name - The widget name",
        " * @returns the widget",
        " */",
      ),
    );
    expect(result.appliedRules).toContain("remove-type-braces");
    expect(result.appliedRules).toContain("rename-tags");
    expect(result.appliedRules).toContain("remove-redundant-tags");
  });

  it("records applied rules in application order", () => {
    const input = "/** @param {string} name The name */";
    const result = runPipeline(input, { lite: false });

    expect(result.appliedRules).toEqual([
      "remove-type-braces",
      "add-hyphen-separator",
    ]);
  });

  describe("lite mode", () => {
    it("fixes @param/@returns hygiene but leaves structural tags", () => {
      const input = comment(
        "/**",
        " * @param {string} name The name",
        " * @async",
        " */",
      );

      const result = runPipeline(input, { lite: true });

      expect(result.output).toContain("@param name - The name");
      expect(result.output).toContain("@async");
    });

    it("does not run structural removal rules", () => {
      const input = comment("/**", " * @async", " */");
      const result = runPipeline(input, { lite: true });

      expect(result.changed).toBe(false);
    });
  });
});
