import { describe, expect, it } from "vitest";

import { convertSourceText } from "@/commands/convert-file";

const source = [
  "/**",
  " * @module lib/math",
  " */",
  "",
  "/**",
  " * Adds two numbers.",
  " * @param {number} a The first addend",
  " * @return {number} the sum",
  " */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
].join("\n");

describe("convertSourceText", () => {
  it("rewrites every JSDoc comment in the file", () => {
    const result = convertSourceText(source, "math.ts", { lite: false });

    expect(result.changed).toBe(true);
    expect(result.commentsChanged).toBe(2);
    expect(result.output).toContain("@packageDocumentation");
    expect(result.output).toContain("@param a - The first addend");
    expect(result.output).toContain("@returns the sum");
    expect(result.output).not.toContain("{number}");
    // Code outside comments is untouched.
    expect(result.output).toContain(
      "export function add(a: number, b: number): number {",
    );
  });

  it("aggregates the distinct rules that fired", () => {
    const result = convertSourceText(source, "math.ts", { lite: false });
    expect(result.appliedRules).toContain("remove-type-braces");
    expect(result.appliedRules).toContain("convert-file-overview");
  });

  it("reports no change for already-clean TSDoc", () => {
    const clean = [
      "/**",
      " * Adds two numbers.",
      " *",
      " * @param a - The first addend.",
      " * @returns The sum.",
      " */",
      "export function add(a: number, b: number) {",
      "  return a + b;",
      "}",
    ].join("\n");

    const result = convertSourceText(clean, "math.ts", { lite: false });
    expect(result.changed).toBe(false);
    expect(result.output).toBe(clean);
  });

  it("respects lite mode by leaving structural tags in place", () => {
    const withAsync = [
      "/**",
      " * Loads data.",
      " * @async",
      " * @param {string} id The id",
      " */",
      "export async function load(id: string) {}",
    ].join("\n");

    const result = convertSourceText(withAsync, "load.ts", { lite: true });
    expect(result.output).toContain("@async");
    expect(result.output).toContain("@param id - The id");
  });
});
