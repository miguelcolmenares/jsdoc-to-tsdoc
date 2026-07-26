import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkSourceText } from "@/commands/check-file";
import { createTsdocValidator, type TsdocValidator } from "@/validator";

let root = "";
let validator: TsdocValidator;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-checkfile-"));
  validator = await createTsdocValidator(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const all = { syntaxOnly: false };

describe("checkSourceText", () => {
  it("reports nothing for a documented, valid file", () => {
    const source = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param a - First.",
      " * @returns The sum.",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");

    const result = checkSourceText(source, "math.ts", validator, all);

    expect(result.problems).toEqual([]);
    expect(result.counts).toEqual({ syntax: 0, missing: 0, legacy: 0 });
  });

  it("reports an undocumented export", () => {
    const result = checkSourceText(
      "export function add(a: number): number {\n  return a;\n}\n",
      "math.ts",
      validator,
      all,
    );

    expect(result.counts.missing).toBe(1);
    expect(result.problems[0]?.message).toBe("Missing TSDoc for add.");
  });

  it("names every binding of a multi-binding export", () => {
    // One statement, one comment position — naming only the first would send
    // the reader after a declaration that is already covered.
    const result = checkSourceText(
      "export const A = 1, B = 2;\n",
      "a.ts",
      validator,
      all,
    );

    expect(result.problems[0]?.message).toBe("Missing TSDoc for A, B.");
  });

  it("reports a TSDoc syntax violation with its line", () => {
    const source = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param {number} a - First.",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");

    const result = checkSourceText(source, "math.ts", validator, all);

    const syntax = result.problems.filter(
      (problem) => problem.kind === "syntax",
    );
    expect(syntax).toHaveLength(1);
    expect(syntax[0]?.line).toBe(4);
  });

  it("reports leftover JSDoc syntax as legacy", () => {
    const source = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param {number} a - First.",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");

    const result = checkSourceText(source, "math.ts", validator, all);

    expect(result.counts.legacy).toBe(1);
  });

  it("does not report legacy for a comment convert would leave alone", () => {
    const source = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param a - First.",
      " * @returns The sum.",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");

    expect(checkSourceText(source, "math.ts", validator, all).counts.legacy).toBe(
      0,
    );
  });

  it("reports only syntax under syntaxOnly", () => {
    const source = [
      "/** @param {number} a - First. */",
      "export function add(a: number): number { return a; }",
      "",
      "export function undocumented(): void {}",
      "",
    ].join("\n");

    const result = checkSourceText(source, "math.ts", validator, {
      syntaxOnly: true,
    });

    expect(result.counts.missing).toBe(0);
    expect(result.counts.legacy).toBe(0);
    expect(result.counts.syntax).toBeGreaterThan(0);
  });

  it("orders problems by line", () => {
    const source = [
      "export function first(): void {}",
      "",
      "/** @param {number} b - Second. */",
      "export function second(b: number): number { return b; }",
      "",
    ].join("\n");

    const result = checkSourceText(source, "a.ts", validator, all);
    const lines = result.problems.map((problem) => problem.line);

    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it("skips re-export statements", () => {
    const result = checkSourceText(
      'export { helper } from "./helper";\n',
      "index.ts",
      validator,
      all,
    );

    expect(result.counts.missing).toBe(0);
  });
});
