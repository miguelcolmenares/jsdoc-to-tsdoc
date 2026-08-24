import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

import convertCommand, { newViolationCount } from "@/commands/convert";
import type { TsdocValidator, TsdocViolation } from "@/validator";

const roots: string[] = [];

const LEGACY = [
  "/**",
  " * Adds numbers.",
  " *",
  " * @param {number} a - First.",
  " * @async",
  " */",
  "export function add(a: number): number {",
  "  return a;",
  "}",
  "",
].join("\n");

async function project(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jtt-convert-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}

const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}

async function run(
  args: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown): boolean => {
      stdout.push(String(chunk));
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      stderr.push(String(chunk));
      return true;
    });
  try {
    await runHandler(convertCommand, args);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { stdout: stdout.join(""), stderr: stderr.join("") };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  process.exitCode = 0;
});

describe("convert command", () => {
  it("writes a converted file when no tsdoc.json exists", async () => {
    const root = await project({ "src/a.ts": LEGACY });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("across 1/1 file(s)");
    const after = await readFile(join(root, "src/a.ts"), "utf8");
    expect(after).toContain("@param a - First.");
    expect(after).not.toContain("@async");
  });

  it("writes a converted file when a valid tsdoc.json exists", async () => {
    const root = await project({ "src/a.ts": LEGACY });
    await writeFile(
      join(root, "tsdoc.json"),
      JSON.stringify({
        $schema:
          "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
        tagDefinitions: [],
      }),
    );

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("across 1/1 file(s)");
    const after = await readFile(join(root, "src/a.ts"), "utf8");
    expect(after).toContain("@param a - First.");
  });

  it("does not block a conversion on a custom tag already present before it ran", async () => {
    // @since is undefined without a tsdoc.json that registers it — the same
    // violation exists in the file before and after convert touches an
    // unrelated tag, so the safety net must not treat that as new.
    const withCustomTag = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param {number} a - First.",
      " * @since 1.0.0",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");
    const root = await project({ "src/a.ts": withCustomTag });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("across 1/1 file(s)");
  });
});

describe("newViolationCount", () => {
  function stubValidator(counts: Record<string, number>): TsdocValidator {
    return {
      configPath: undefined,
      configErrors: [],
      validate: (sourceText): readonly TsdocViolation[] =>
        Array.from({ length: counts[sourceText] ?? 0 }, (): TsdocViolation => ({
          line: 1,
          column: 1,
          messageId: "tsdoc-undefined-tag",
          message: "stub",
        })),
    };
  }

  it("returns a positive count when the conversion added a violation", () => {
    const validator = stubValidator({ before: 0, after: 1 });
    expect(newViolationCount(validator, "before", "after", "a.ts")).toBe(1);
  });

  it("returns zero or negative when the conversion made things no worse", () => {
    const validator = stubValidator({ before: 2, after: 2 });
    expect(newViolationCount(validator, "before", "after", "a.ts")).toBe(0);

    const improved = stubValidator({ before: 2, after: 0 });
    expect(newViolationCount(improved, "before", "after", "a.ts")).toBe(-2);
  });
});
