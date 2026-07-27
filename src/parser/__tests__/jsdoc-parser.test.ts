import { describe, expect, it } from "vitest";

import {
  getBlockTags,
  hasTypeBraces,
  readPropertyTags,
} from "@/parser/jsdoc-parser";

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

describe("readPropertyTags", () => {
  it("reads the name, description and span of each tag", () => {
    const input = comment(
      "/**",
      " * Banner data.",
      " *",
      " * @property title - Banner title",
      " * @property height - Banner height in pixels",
      " */",
    );

    expect(readPropertyTags(input)).toEqual([
      { name: "title", description: "Banner title", line: 3, lineCount: 1 },
      {
        name: "height",
        description: "Banner height in pixels",
        line: 4,
        lineCount: 1,
      },
    ]);
  });

  it("folds a wrapped description into the tag that owns it", () => {
    const input = comment(
      "/**",
      " * @property backgroundImage - Proxied URL for the banner",
      " *   background image, resolved at build time",
      " * @property height - Banner height",
      " */",
    );

    expect(readPropertyTags(input)[0]).toEqual({
      name: "backgroundImage",
      description:
        "Proxied URL for the banner background image, resolved at build time",
      line: 1,
      lineCount: 2,
    });
  });

  // The name is read as a whole token rather than matched against an
  // identifier pattern: a spelling this reader misses is a description the
  // removal rule cannot know to preserve, which is the failure being fixed.
  it("accepts the JSDoc spellings the tag appears in", () => {
    const input = comment(
      "/**",
      " * @property {string} typed - Has a type brace",
      " * @property [optional] - Bracketed",
      " * @property [withDefault=1] - Bracketed with a default",
      " * @property ['quoted-key'] - Bracketed and quoted",
      " * @property \"double-quoted\" - Quoted alone",
      " * @property nested.field - Dot notation",
      " * @prop aliased - The @prop alias",
      " * @property noSeparator The hyphen is optional in JSDoc",
      " */",
    );

    expect(readPropertyTags(input).map((tag) => [tag.name, tag.description])).toEqual([
      ["typed", "Has a type brace"],
      ["optional", "Bracketed"],
      ["withDefault", "Bracketed with a default"],
      ["quoted-key", "Bracketed and quoted"],
      ["double-quoted", "Quoted alone"],
      ["nested.field", "Dot notation"],
      ["aliased", "The @prop alias"],
      ["noSeparator", "The hyphen is optional in JSDoc"],
    ]);
  });

  it("reports a tag that names nothing but carries prose", () => {
    const input = comment("/**", " * @property - Just a description", " */");
    expect(readPropertyTags(input)).toEqual([
      { name: "", description: "Just a description", line: 1, lineCount: 1 },
    ]);
  });

  it("ignores tags inside a fenced example", () => {
    const input = comment(
      "/**",
      " * Summary.",
      " *",
      " * @example",
      " * ```ts",
      " * /** @property fake - Not a real tag *\\/",
      " * ```",
      " */",
    );

    expect(readPropertyTags(input)).toEqual([]);
  });

  // A mid-line tag has no unambiguous end, and guessing where a description
  // stops would destroy the prose the move exists to rescue.
  it("reports nothing for a tag that does not open its line", () => {
    expect(readPropertyTags("/** Summary. @property id - The id. */")).toEqual([]);
  });

  it("reports a tag with no description rather than skipping it", () => {
    const input = comment("/**", " * @property bare", " */");
    expect(readPropertyTags(input)).toEqual([
      { name: "bare", description: "", line: 1, lineCount: 1 },
    ]);
  });

  it("does not treat a following tag as a continuation", () => {
    const input = comment(
      "/**",
      " * @property id - The id",
      " * @returns Something",
      " */",
    );
    expect(readPropertyTags(input)).toEqual([
      { name: "id", description: "The id", line: 1, lineCount: 1 },
    ]);
  });
});
