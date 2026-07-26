import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTsdocValidator } from "@/validator/tsdoc-validator";

const roots: string[] = [];

async function project(tsdocJson?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jtt-validator-"));
  roots.push(root);
  if (tsdocJson !== undefined) {
    await writeFile(join(root, "tsdoc.json"), tsdocJson);
  }
  return root;
}

const withSinceTag = JSON.stringify({
  $schema:
    "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createTsdocValidator", () => {
  it("reports a JSDoc type brace with file coordinates", async () => {
    const validator = await createTsdocValidator(await project());
    const source = [
      "const filler = 1;",
      "",
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

    const violations = validator.validate(source, "math.ts");

    expect(violations).toHaveLength(1);
    // Line 6 of the file, not line 4 of the comment: positions must be reported
    // in file coordinates or the CI output points at nothing.
    expect(violations[0]?.line).toBe(6);
    expect(violations[0]?.messageId).toBe("tsdoc-param-tag-with-invalid-type");
  });

  it("rejects a custom tag when no tsdoc.json is present", async () => {
    const validator = await createTsdocValidator(await project());
    const source = "/**\n * Doc.\n *\n * @since 0.1.0\n */\nexport const a = 1;\n";

    const violations = validator.validate(source, "a.ts");

    expect(violations.map((violation) => violation.messageId)).toEqual([
      "tsdoc-undefined-tag",
    ]);
    expect(validator.configPath).toBeUndefined();
  });

  it("accepts the same custom tag once tsdoc.json defines it", async () => {
    // Without this, every `@since` in a real codebase is a violation the
    // project's own lint accepts — the false-positive trap that would make the
    // gate unusable on the repos this tool was built for.
    const validator = await createTsdocValidator(await project(withSinceTag));
    const source = "/**\n * Doc.\n *\n * @since 0.1.0\n */\nexport const a = 1;\n";

    expect(validator.validate(source, "a.ts")).toEqual([]);
    expect(validator.configPath).toContain("tsdoc.json");
  });

  it("accepts a valid comment", async () => {
    const validator = await createTsdocValidator(await project());
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

    expect(validator.validate(source, "math.ts")).toEqual([]);
  });

  it("does not flag code inside a fenced example", async () => {
    const validator = await createTsdocValidator(await project());
    const source = [
      "/**",
      " * Doc.",
      " *",
      " * @example",
      " * ```typescript",
      " * const x = a < b;",
      " * ```",
      " */",
      "export const a = 1;",
      "",
    ].join("\n");

    expect(validator.validate(source, "a.ts")).toEqual([]);
  });

  it("finds violations in several comments in one file", async () => {
    const validator = await createTsdocValidator(await project());
    const source = [
      "/** @param {string} a - One. */",
      "export function one(a: string): string { return a; }",
      "",
      "/** @param {string} b - Two. */",
      "export function two(b: string): string { return b; }",
      "",
    ].join("\n");

    const violations = validator.validate(source, "a.ts");

    expect(violations.map((violation) => violation.line)).toEqual([1, 4]);
  });

  it("reports a parse error for a broken tsdoc.json", async () => {
    const validator = await createTsdocValidator(await project("{ not json"));

    expect(validator.configErrors.length).toBeGreaterThan(0);
    expect(validator.configErrors.join(" ")).toMatch(/parsing JSON/i);
  });

  it("treats a missing tsdoc.json as no config, not as an error", async () => {
    // The normal state of a project that has not run `init` yet. Reporting it
    // as a config error would make the gate refuse to check anything.
    const validator = await createTsdocValidator(await project());

    expect(validator.configErrors).toEqual([]);
    expect(validator.configPath).toBeUndefined();
  });

  it("returns nothing for a file with no doc comments", async () => {
    const validator = await createTsdocValidator(await project());
    expect(validator.validate("export const a = 1;\n", "a.ts")).toEqual([]);
  });
});
