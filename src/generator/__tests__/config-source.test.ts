import { describe, expect, it } from "vitest";

import { readConfigLines } from "@/generator/config-source";

const codeText = (source: string): string[] =>
  readConfigLines(source)
    .filter((line) => line.isCode)
    .map((line) => line.text);

describe("readConfigLines", () => {
  it("returns one entry per line, preserving the text", () => {
    const lines = readConfigLines("a\nb\nc");
    expect(lines.map((line) => line.text)).toEqual(["a", "b", "c"]);
    expect(lines.every((line) => line.isCode)).toBe(true);
  });

  it("flags line comments as non-code", () => {
    expect(codeText('// import "x";\nconst a = 1;')).toEqual(["const a = 1;"]);
  });

  it("flags every line of a multi-line block comment", () => {
    const source = ["/*", " * rules go here", " */", "const a = 1;"].join("\n");
    expect(codeText(source)).toEqual(["const a = 1;"]);
  });

  it("resumes code after a single-line block comment", () => {
    expect(codeText("/* note */\nconst a = 1;")).toEqual(["const a = 1;"]);
  });

  it("does not treat a glob string as a block comment", () => {
    // A global `/* … */` strip would swallow the rest of the file here.
    const source = ['files: ["src/**/*.ts"],', "const a = 1;"].join("\n");
    expect(codeText(source)).toEqual(source.split("\n"));
  });

  it("keeps a trailing line comment on a code line", () => {
    expect(codeText("const a = 1; // keep")).toEqual(["const a = 1; // keep"]);
  });
});
