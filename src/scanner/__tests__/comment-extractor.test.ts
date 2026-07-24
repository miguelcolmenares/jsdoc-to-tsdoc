import { describe, expect, it } from "vitest";

import { applyEdits, extractJsDocComments } from "@/scanner/comment-extractor";

describe("extractJsDocComments", () => {
  it("extracts a file header and a declaration comment in source order", () => {
    const source = [
      "/** @packageDocumentation */",
      "",
      "/** Adds two numbers. */",
      "export function add(a: number, b: number) {",
      "  return a + b;",
      "}",
    ].join("\n");

    const comments = extractJsDocComments(source, "math.ts");

    expect(comments.map((c) => c.text)).toEqual([
      "/** @packageDocumentation */",
      "/** Adds two numbers. */",
    ]);
  });

  it("ignores line comments and non-doc block comments", () => {
    const source = [
      "// a line comment",
      "/* not a doc comment */",
      "/** a doc comment */",
      "export const x = 1;",
    ].join("\n");

    const comments = extractJsDocComments(source, "x.ts");

    expect(comments).toHaveLength(1);
    expect(comments[0]?.text).toBe("/** a doc comment */");
  });

  it("does not match /** */ inside a string literal", () => {
    const source = 'export const s = "/** not a comment */";\n';
    expect(extractJsDocComments(source, "s.ts")).toHaveLength(0);
  });

  it("returns offsets that slice back to the original comment text", () => {
    const source = "/** Doc. */\nexport const y = 2;\n";
    const [comment] = extractJsDocComments(source, "y.ts");

    expect(comment).toBeDefined();
    expect(source.slice(comment?.pos, comment?.end)).toBe("/** Doc. */");
  });
});

describe("applyEdits", () => {
  it("replaces a single span", () => {
    const source = "/** old */\nexport const a = 1;\n";
    const result = applyEdits(source, [{ pos: 0, end: 10, text: "/** new */" }]);
    expect(result).toBe("/** new */\nexport const a = 1;\n");
  });

  it("applies multiple edits without offset drift", () => {
    const source = "AAAA BBBB CCCC";
    const result = applyEdits(source, [
      { pos: 0, end: 4, text: "a" },
      { pos: 10, end: 14, text: "ccc" },
    ]);
    expect(result).toBe("a BBBB ccc");
  });
});
