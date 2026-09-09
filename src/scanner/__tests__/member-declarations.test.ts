import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { collectMemberDeclarations } from "@/scanner/member-declarations";

const source = (...lines: string[]): string => `${lines.join("\n")}\n`;

/**
 * Parses `text` and returns its first top-level interface or type-alias
 * statement, plus the parsed source file — the two arguments
 * `collectMemberDeclarations` takes, mirroring what `export-inventory.ts`
 * already holds when it calls the real thing.
 */
function firstDeclaration(
  text: string,
  fileName = "a.ts",
): { statement: ts.Statement; sourceFile: ts.SourceFile } {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const statement = sourceFile.statements.find(
    (node) =>
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
  );
  if (statement === undefined) {
    throw new Error("fixture declares no interface or type alias");
  }
  return { statement, sourceFile };
}

describe("collectMemberDeclarations", () => {
  it("lists an interface's members as insertion targets, undocumented header included", () => {
    // No header comment at all — the case `member-targets.ts` cannot answer,
    // since it has no comment position to key by.
    const text = source(
      "export interface Banner {",
      "  title: string;",
      "  height: number;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    const members = collectMemberDeclarations(statement, sourceFile);

    expect(members).toEqual([
      expect.objectContaining({ name: "title", hasDocComment: false }),
      expect.objectContaining({ name: "height", hasDocComment: false }),
    ]);
  });

  it("reports a member's own doc comment independently of the header's", () => {
    const text = source(
      "/**",
      " * Banner data.",
      " */",
      "export interface Banner {",
      "  /** The title. */",
      "  title: string;",
      "  height: number;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    const members = collectMemberDeclarations(statement, sourceFile);

    expect(members).toEqual([
      expect.objectContaining({ name: "title", hasDocComment: true }),
      expect.objectContaining({ name: "height", hasDocComment: false }),
    ]);
  });

  it("reads a type-literal alias the same way as an interface", () => {
    const text = source("export type Options = {", "  retries: number;", "};");
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([
      expect.objectContaining({ name: "retries", hasDocComment: false }),
    ]);
  });

  it("returns nothing for a non-object-literal type alias", () => {
    const text = source('export type Status = "new" | "done";');
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([]);
  });

  it("flags a method signature as function-like, with its parameters", () => {
    const text = source(
      "export interface Api {",
      "  fetch(id: string): Promise<string>;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([
      expect.objectContaining({
        name: "fetch",
        isFunctionLike: true,
        hasReturnValue: true,
        parameters: [{ name: "id", isOptional: false, isSynthesized: false }],
      }),
    ]);
  });

  it("flags a property typed as a function the same way as a method signature", () => {
    const text = source(
      "export interface Api {",
      "  onSelect: (id: string) => void;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([
      expect.objectContaining({
        name: "onSelect",
        isFunctionLike: true,
        hasReturnValue: false,
        parameters: [{ name: "id", isOptional: false, isSynthesized: false }],
      }),
    ]);
  });

  it("treats a plain data property as not function-like", () => {
    const text = source("export interface Props {", "  title: string;", "}");
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([
      expect.objectContaining({
        name: "title",
        isFunctionLike: false,
        parameters: [],
        hasReturnValue: false,
      }),
    ]);
  });

  it("skips members no @property-style tag could address", () => {
    const text = source(
      "export interface Bag {",
      "  [key: string]: unknown;",
      "  size: number;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([
      expect.objectContaining({ name: "size" }),
    ]);
  });

  it("records each member's own indentation and offsets, in source order", () => {
    const text = source(
      "export interface Outer {",
      "    deep: string;",
      "    shallow: number;",
      "}",
    );
    const { statement, sourceFile } = firstDeclaration(text);

    const members = collectMemberDeclarations(statement, sourceFile);
    expect(members.map((member) => member.name)).toEqual(["deep", "shallow"]);
    expect(members[0]).toMatchObject({ indent: "    ", ownsLine: true });
    // `insertPos` is the start of the member's own *line* (matching how a
    // top-level declaration's stub is anchored), not the member token itself.
    const memberOffset = text.indexOf("deep: string");
    const lineStart = text.lastIndexOf("\n", memberOffset) + 1;
    expect(members[0]?.insertPos).toBe(lineStart);
  });

  it("returns an empty list for a declaration with no members", () => {
    const text = source("export interface Empty {}");
    const { statement, sourceFile } = firstDeclaration(text);

    expect(collectMemberDeclarations(statement, sourceFile)).toEqual([]);
  });
});
