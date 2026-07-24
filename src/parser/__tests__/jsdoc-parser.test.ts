import { describe, expect, it } from "vitest";

import { getBlockTags, hasTypeBraces } from "@/parser/jsdoc-parser";

const comment = (...lines: string[]): string => lines.join("\n");

describe("getBlockTags", () => {
  it("collects distinct block tags in first-seen order", () => {
    const input = comment(
      "/**",
      " * Summary.",
      " * @param a - one",
      " * @param b - two",
      " * @returns something",
      " */",
    );
    expect(getBlockTags(input)).toEqual(["@param", "@returns"]);
  });

  it("ignores tags inside fenced code blocks", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```ts",
      " * @param not-a-real-tag",
      " * ```",
      " */",
    );
    expect(getBlockTags(input)).toEqual(["@example"]);
  });
});

describe("hasTypeBraces", () => {
  it("detects a JSDoc type annotation", () => {
    expect(hasTypeBraces("/** @param {string} name - x */")).toBe(true);
  });

  it("is false for clean TSDoc", () => {
    expect(hasTypeBraces("/** @param name - x */")).toBe(false);
  });

  it("ignores braces inside fenced code", () => {
    const input = comment(
      "/**",
      " * @example",
      " * ```ts",
      " * @param {x} y",
      " * ```",
      " */",
    );
    expect(hasTypeBraces(input)).toBe(false);
  });
});
