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

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("convertSourceText and @property", () => {
  // The case measured on the real repos: homecare's `homepage.ts` carried
  // seven descriptions that existed nowhere else, and every one was deleted.
  it("moves a description onto the member it documents", () => {
    const input = lines(
      "/**",
      " * Homepage banner data.",
      " *",
      " * @property title - Banner title (may contain HTML)",
      " * @property height - Banner minimum height in pixels",
      " */",
      "export interface HomepageBanner {",
      "  title: string | null;",
      "  height: string | null;",
      "}",
    );

    const result = convertSourceText(input, "homepage.ts", { lite: false });

    expect(result.membersDocumented).toBe(2);
    expect(result.output).toContain(
      "  /** Banner title (may contain HTML) */\n  title: string | null;",
    );
    expect(result.output).toContain(
      "  /** Banner minimum height in pixels */\n  height: string | null;",
    );
    expect(result.output).not.toContain("@property");
  });

  it("deletes a description the member already carries", () => {
    const input = lines(
      "/**",
      " * Contact form state.",
      " *",
      " * @property success - Whether submission was successful",
      " */",
      "export interface ContactFormState {",
      "  /** True if form submitted successfully */",
      "  success: boolean;",
      "}",
    );

    const result = convertSourceText(input, "contact-form.ts", { lite: false });

    expect(result.output).not.toContain("@property");
    expect(result.membersDocumented).toBe(0);
    // The member's own wording is left alone rather than overwritten.
    expect(result.output).toContain("/** True if form submitted successfully */");
  });

  // `export const styles = [...]` in the boilerplate: the prose describes the
  // shape of array elements, and there is no member to move it onto.
  it("keeps a description with nowhere to go", () => {
    const input = lines(
      "/**",
      " * Predefined styles to load.",
      " *",
      " * @property id - Unique identifier for the style",
      " */",
      "export const styles = [{ id: 'a' }];",
    );

    const result = convertSourceText(input, "constants.ts", { lite: false });

    // Kept as prose, not as a tag: TSDoc has no `@property`, so leaving the tag
    // would survive `convert` only to fail `check` with tsdoc-undefined-tag.
    expect(result.output).toContain("- `id` \u2014 Unique identifier for the style");
    expect(result.output).not.toContain("@property");
    expect(result.membersDocumented).toBe(0);
  });

  it("keeps a tag naming something the interface does not declare", () => {
    const input = lines(
      "/**",
      " * Banner data.",
      " *",
      " * @property title - Banner title",
      " * @property removedLastYear - No longer a field",
      " */",
      "export interface Banner {",
      "  title: string;",
      "}",
    );

    const result = convertSourceText(input, "banner.ts", { lite: false });

    expect(result.output).toContain("- `removedLastYear` \u2014 No longer a field");
    expect(result.output).not.toContain("@property");
    expect(result.membersDocumented).toBe(1);
  });

  it("moves a wrapped description in one piece", () => {
    const input = lines(
      "/**",
      " * Banner data.",
      " *",
      " * @property backgroundImage - Proxied URL for the banner",
      " *   background image, resolved at build time",
      " */",
      "export interface Banner {",
      "  backgroundImage: string;",
      "}",
    );

    const result = convertSourceText(input, "banner.ts", { lite: false });

    expect(result.output).toContain(
      "/** Proxied URL for the banner background image, resolved at build time */",
    );
    expect(result.output).not.toContain("resolved at build time */\n *");
  });

  it("leaves @property alone in --lite mode", () => {
    const input = lines(
      "/**",
      " * Banner data.",
      " *",
      " * @property title - Banner title",
      " */",
      "export interface Banner {",
      "  title: string;",
      "}",
    );

    const result = convertSourceText(input, "banner.ts", { lite: true });

    expect(result.output).toContain("@property title - Banner title");
    expect(result.membersDocumented).toBe(0);
  });

  it("is a no-op on a second run", () => {
    const input = lines(
      "/**",
      " * Banner data.",
      " *",
      " * @property title - Banner title",
      " */",
      "export interface Banner {",
      "  title: string;",
      "}",
    );

    const once = convertSourceText(input, "banner.ts", { lite: false });
    const twice = convertSourceText(once.output, "banner.ts", { lite: false });

    expect(twice.changed).toBe(false);
    expect(twice.output).toBe(once.output);
  });

  it("documents the members of a type alias over a type literal", () => {
    const input = lines(
      "/**",
      " * Request options.",
      " *",
      " * @property retries - How many times to retry",
      " */",
      "export type Options = {",
      "  retries: number;",
      "};",
    );

    const result = convertSourceText(input, "options.ts", { lite: false });

    expect(result.output).toContain("  /** How many times to retry */\n  retries: number;");
  });
});
