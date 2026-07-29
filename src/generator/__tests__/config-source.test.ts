import { describe, expect, it } from "vitest";

import { readConfigLines } from "@/generator/config-source";

/** The code that survives masking on each line, whitespace-normalized. */
const codeOf = (source: string): string[] =>
  readConfigLines(source).map((line) => line.code.trim());

/** The raw masks, for the cases where exact spacing is the point. */
const masked = (source: string): string[] =>
  readConfigLines(source).map((line) => line.code);

describe("readConfigLines", () => {
  it("returns one entry per line, preserving the text", () => {
    const lines = readConfigLines("a\nb\nc");
    expect(lines.map((line) => line.text)).toEqual(["a", "b", "c"]);
    expect(lines.map((line) => line.code)).toEqual(["a", "b", "c"]);
  });

  it("masks a whole-line comment", () => {
    expect(codeOf('// import "x";\nconst a = 1;')).toEqual([
      "",
      "const a = 1;",
    ]);
  });

  it("masks a trailing line comment but keeps the code before it", () => {
    // Classifying the whole line as code would let a rule assignment quoted
    // inside the comment be matched and rewritten.
    expect(codeOf('const a = 1; // "tsdoc-require-2/require": "warn"')).toEqual(
      ["const a = 1;"],
    );
  });

  it("masks every line of a multi-line block comment", () => {
    const source = ["/*", " * rules go here", " */", "const a = 1;"].join("\n");
    expect(codeOf(source)).toEqual(["", "", "", "const a = 1;"]);
  });

  it("masks a block comment that opens mid-line", () => {
    // The case whole-line classification misses entirely: the opener shares a
    // line with real code, so the lines that follow are comment, not code.
    const source = [
      "export default [ /* disabled",
      '  "tsdoc-require-2/require": "warn",',
      "*/ ];",
    ].join("\n");

    expect(codeOf(source)).toEqual(["export default [", "", "];"]);
  });

  it("resumes code after a block comment closes mid-line", () => {
    expect(codeOf("/* note */ const a = 1;")).toEqual(["const a = 1;"]);
  });

  it("does not treat a glob string as a block comment", () => {
    // A naive `/* … */` strip would swallow the rest of the file here.
    const source = ['files: ["src/**/*.ts"],', "const a = 1;"].join("\n");
    expect(masked(source)).toEqual(source.split("\n"));
  });

  it("does not treat a URL inside a string as a line comment", () => {
    const source = 'const docs = "https://tsdoc.org/";';
    expect(masked(source)).toEqual([source]);
  });

  it("keeps an escaped quote from closing a string early", () => {
    const source = 'const q = "a \\" // not a comment";';
    expect(masked(source)).toEqual([source]);
  });

  it("carries an unterminated template literal across lines", () => {
    const source = [
      "const t = `line one",
      "// still inside the template`;",
    ].join("\n");
    expect(masked(source)).toEqual(source.split("\n"));
  });

  it("masks a comment appearing after a string that contains a slash", () => {
    const source = 'files: ["src/**/*.ts"], // keep last';
    expect(codeOf(source)).toEqual(['files: ["src/**/*.ts"],']);
  });

  it("keeps the mask the same length as the original line", () => {
    const source = [
      "export default [ /* a",
      "  b // c",
      "*/ ]; // trailing",
      'const s = "text";',
    ].join("\n");

    for (const line of readConfigLines(source)) {
      expect(line.code).toHaveLength(line.text.length);
    }
  });
});
