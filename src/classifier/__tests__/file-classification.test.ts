import { describe, expect, it } from "vitest";

import { classifyFile } from "@/classifier/file-classification";
import { collectExportedDeclarations } from "@/scanner";

/** Classifies a whole source snippet. */
const classify = (source: string, fileName = "a.ts") =>
  classifyFile(collectExportedDeclarations(source, fileName));

describe("classifyFile", () => {
  it("returns undefined for a file that exports nothing", () => {
    expect(classify("const internal = 1;\n")).toBeUndefined();
  });

  it("reports a fully documented file as valid with high confidence", () => {
    const source = [
      "/**",
      " * Adds one.",
      " *",
      " * @param a - The addend.",
      " * @returns The sum.",
      " */",
      "export function inc(a: number): number { return a + 1; }",
    ].join("\n");

    const result = classify(source);
    expect(result?.topology).toBe("valid");
    expect(result?.confidence).toBe("high");
    expect(result?.counts.valid).toBe(1);
  });

  // A file lands in exactly one bucket, and it must be the one naming the next
  // action — so the most severe topology wins, not the most common one.
  it("takes the most severe topology, not the majority", () => {
    const source = [
      "/**",
      " * Adds one.",
      " *",
      " * @param a - The addend.",
      " * @returns The sum.",
      " */",
      "export function inc(a: number): number { return a + 1; }",
      "",
      "/**",
      " * Greets.",
      " *",
      " * @param name - Who to greet.",
      " * @returns The greeting.",
      " */",
      "export function greet(userId: string): string { return userId; }",
    ].join("\n");

    const result = classify(source);
    expect(result?.topology).toBe("stale");
    expect(result?.confidence).toBe("stale");
    expect(result?.counts).toEqual({
      valid: 1,
      partial: 0,
      "line-comments": 0,
      "no-docs": 0,
      stale: 1,
    });
  });

  it("ranks no-docs above line-comments, which already has prose to reuse", () => {
    const source = [
      "// Fetches the user.",
      "export function getUser(id: string): string { return id; }",
      "",
      "export function getRole(id: string): string { return id; }",
    ].join("\n");

    const result = classify(source);
    expect(result?.topology).toBe("no-docs");
    expect(result?.counts["line-comments"]).toBe(1);
    expect(result?.counts["no-docs"]).toBe(1);
  });

  it("ranks line-comments above partial", () => {
    const source = [
      "/**",
      " * Adds one.",
      " */",
      "export function inc(a: number): number { return a + 1; }",
      "",
      "// Fetches the user.",
      "export function getUser(id: string): string { return id; }",
    ].join("\n");

    expect(classify(source)?.topology).toBe("line-comments");
  });

  it("keeps every declaration's own verdict in source order", () => {
    const source = [
      "export function first(): void {}",
      "",
      "// Second has prose.",
      "export function second(): void {}",
    ].join("\n");

    const result = classify(source);
    expect(result?.declarations.map((d) => [d.name, d.topology])).toEqual([
      ["first", "no-docs"],
      ["second", "line-comments"],
    ]);
  });
});
