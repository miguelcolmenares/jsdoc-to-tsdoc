import { describe, expect, it } from "vitest";

import { collectMemberTargets } from "@/scanner/member-targets";

const source = (...lines: string[]): string => `${lines.join("\n")}\n`;

/** Reads the single entry a one-comment fixture produces. */
const only = (
  targets: ReadonlyMap<number, readonly { name: string }[]>,
): readonly { name: string }[] | undefined => [...targets.values()][0];

describe("collectMemberTargets", () => {
  it("lists an interface's members with their documentation state", () => {
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

    const members = only(collectMemberTargets(text, "banner.ts"));

    expect(members).toEqual([
      expect.objectContaining({ name: "title", hasDocComment: true }),
      expect.objectContaining({ name: "height", hasDocComment: false }),
    ]);
  });

  it("reads a type alias over a type literal", () => {
    const text = source(
      "/**",
      " * Options.",
      " */",
      "export type Options = {",
      "  retries: number;",
      "};",
    );

    expect(only(collectMemberTargets(text, "options.ts"))).toEqual([
      expect.objectContaining({ name: "retries", hasDocComment: false }),
    ]);
  });

  // "Nothing to move a description onto" and "every member is already
  // documented" lead to opposite decisions, so they must not both be an empty
  // list. This is the `export const styles = [...]` case from the real repos.
  it("omits a declaration with no named members instead of reporting none", () => {
    const text = source(
      "/**",
      " * Styles to load.",
      " *",
      " * @property id - Unique identifier",
      " */",
      "export const styles = [{ id: 'a' }];",
    );

    expect(collectMemberTargets(text, "constants.ts").size).toBe(0);
  });

  it("resolves a comment to the declaration, not to its first member", () => {
    // Leading trivia repeats on every descendant sharing a full start, so a
    // naive walk attributes the interface's comment to `title`, whose own
    // member list is empty — and the descriptions would then look unmovable.
    const text = source(
      "/**",
      " * Banner data.",
      " */",
      "export interface Banner {",
      "  title: string;",
      "}",
    );

    const targets = collectMemberTargets(text, "banner.ts");
    expect(targets.size).toBe(1);
    expect(only(targets)).toEqual([
      expect.objectContaining({ name: "title" }),
    ]);
  });

  it("keys entries by the same offset the comment extractor reports", () => {
    const text = source(
      "/**",
      " * Banner data.",
      " */",
      "export interface Banner {",
      "  title: string;",
      "}",
    );

    expect([...collectMemberTargets(text, "banner.ts").keys()]).toEqual([
      text.indexOf("/**"),
    ]);
  });

  it("records the indent so an inserted comment lines up with its member", () => {
    const text = source(
      "/**",
      " * Nested.",
      " */",
      "export interface Outer {",
      "    deep: string;",
      "}",
    );

    const members = collectMemberTargets(text, "outer.ts").get(text.indexOf("/**"));
    expect(members?.[0]).toMatchObject({ name: "deep", indent: "    " });
  });

  it("skips members no @property tag could name", () => {
    const text = source(
      "/**",
      " * Map-like.",
      " */",
      "export interface Bag {",
      "  [key: string]: unknown;",
      "  size: number;",
      "}",
    );

    expect(only(collectMemberTargets(text, "bag.ts"))).toEqual([
      expect.objectContaining({ name: "size" }),
    ]);
  });

  // The reader accepts `['foo-bar']` and `"foo-bar"` spellings, so the scanner
  // has to be able to match the member they name. Rejecting it here would
  // demote a description to a list item with its destination sitting right
  // below it.
  it("accepts a member named by a string or numeric literal", () => {
    const text = source(
      "/**",
      " * Keyed shape.",
      " */",
      "export interface Keyed {",
      '  "foo-bar": string;',
      "  0: number;",
      "}",
    );

    expect(only(collectMemberTargets(text, "keyed.ts"))).toEqual([
      expect.objectContaining({ name: "foo-bar" }),
      expect.objectContaining({ name: "0" }),
    ]);
  });

  it("still excludes a computed key no @property could name", () => {
    const text = source(
      "const KEY = Symbol();",
      "",
      "/**",
      " * Computed.",
      " */",
      "export interface Odd {",
      "  [KEY]: string;",
      "}",
    );

    expect(collectMemberTargets(text, "odd.ts").size).toBe(0);
  });

  // Filtering every member away leaves the same situation as a declaration
  // with no members, so it must be absent rather than present and empty.
  it("omits a declaration whose members are all unnameable", () => {
    const text = source(
      "/**",
      " * Map-like.",
      " */",
      "export interface Bag {",
      "  [key: string]: unknown;",
      "}",
    );

    expect(collectMemberTargets(text, "bag.ts").size).toBe(0);
  });

  it("handles several documented declarations in one file", () => {
    const text = source(
      "/**",
      " * First.",
      " */",
      "export interface A {",
      "  a: string;",
      "}",
      "",
      "/**",
      " * Second.",
      " */",
      "export interface B {",
      "  b: string;",
      "}",
    );

    const targets = collectMemberTargets(text, "pair.ts");
    expect(targets.size).toBe(2);
    expect([...targets.values()].map((members) => members[0]?.name)).toEqual([
      "a",
      "b",
    ]);
  });
});
