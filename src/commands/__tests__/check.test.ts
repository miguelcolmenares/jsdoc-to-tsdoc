import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

import checkCommand from "@/commands/check";

const roots: string[] = [];

const DOCUMENTED = [
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

const UNDOCUMENTED = "export function subtract(a: number): number {\n  return a;\n}\n";

/** The shape `init` generates: the loader rejects a config without `$schema`. */
const tsdocJsonWith = (tagName: string): string =>
  JSON.stringify({
    $schema:
      "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
    tagDefinitions: [{ tagName, syntaxKind: "block" }],
  });

const LEGACY = [
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

async function project(
  files: Readonly<Record<string, string>>,
  tsdocJson?: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jtt-check-"));
  roots.push(root);
  if (tsdocJson !== undefined) {
    await writeFile(join(root, "tsdoc.json"), tsdocJson);
  }
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
    await runHandler(checkCommand, args);
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

describe("check command", () => {
  it("exits 0 on a clean project", async () => {
    const root = await project({ "src/a.ts": DOCUMENTED });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("TSDoc is valid and complete");
  });

  it("exits 3 and names the undocumented export", async () => {
    const root = await project({ "src/b.ts": UNDOCUMENTED });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBe(3);
    expect(stdout).toContain("Missing TSDoc for subtract.");
    expect(stdout).toContain("scaffold");
  });

  it("exits 3 and points at convert for legacy JSDoc", async () => {
    const root = await project({ "src/c.ts": LEGACY });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBe(3);
    expect(stdout).toContain("convert");
  });

  it("skips test files by default", async () => {
    // `init` writes a config disabling both TSDoc rules for these paths, so the
    // gate must not report what that config would excuse.
    const root = await project({
      "src/a.ts": DOCUMENTED,
      "src/__tests__/a.test.ts": UNDOCUMENTED,
      "src/other.test.ts": UNDOCUMENTED,
    });

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("TSDoc is valid and complete");
  });

  it("checks test files under --include-tests", async () => {
    const root = await project({
      "src/a.ts": DOCUMENTED,
      "src/__tests__/a.test.ts": UNDOCUMENTED,
    });

    await run({ cwd: root, "include-tests": true });

    expect(process.exitCode).toBe(3);
  });

  it("ignores missing and legacy under --syntax-only", async () => {
    const root = await project({ "src/b.ts": UNDOCUMENTED });

    const { stdout } = await run({ cwd: root, "syntax-only": true });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("TSDoc is valid and complete");
  });

  it("still reports syntax violations under --syntax-only", async () => {
    const root = await project({ "src/c.ts": LEGACY });

    const { stdout } = await run({ cwd: root, "syntax-only": true });

    expect(process.exitCode).toBe(3);
    expect(stdout).toContain("syntax");
  });

  it("accepts a custom tag registered in tsdoc.json", async () => {
    const source = [
      "/**",
      " * Adds numbers.",
      " *",
      " * @param a - First.",
      " * @returns The sum.",
      " * @since 0.1.0",
      " */",
      "export function add(a: number): number {",
      "  return a;",
      "}",
      "",
    ].join("\n");
    const root = await project({ "src/a.ts": source }, tsdocJsonWith("@since"));

    await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
  });

  it("exits 2 when tsdoc.json carries an unsupported $schema", async () => {
    // The loader defines no tags in this case, so every custom tag would be
    // reported as undefined. Refusing to run beats thousands of bogus problems.
    const root = await project(
      { "src/a.ts": DOCUMENTED },
      JSON.stringify({
        tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
      }),
    );

    const { stderr } = await run({ cwd: root });

    expect(process.exitCode).toBe(2);
    expect(stderr).toMatch(/\$schema/);
  });

  it("exits 2 without checking anything when tsdoc.json is broken", async () => {
    const root = await project({ "src/b.ts": UNDOCUMENTED }, "{ not json");

    const { stdout, stderr } = await run({ cwd: root });

    expect(process.exitCode).toBe(2);
    expect(stderr).toContain("tsdoc.json");
    // No file was inspected, so no per-file report is emitted.
    expect(stdout).toBe("");
  });

  it("honours --only", async () => {
    const root = await project({
      "src/keep/a.ts": DOCUMENTED,
      "src/skip/b.ts": UNDOCUMENTED,
    });

    await run({ cwd: root, only: "src/keep/**" });

    expect(process.exitCode).toBeFalsy();
  });

  it("honours --exclude", async () => {
    const root = await project({
      "src/a.ts": DOCUMENTED,
      "src/generated/b.ts": UNDOCUMENTED,
    });

    await run({ cwd: root, exclude: "src/generated/**" });

    expect(process.exitCode).toBeFalsy();
  });

  it("emits a JSON report", async () => {
    const root = await project({ "src/b.ts": UNDOCUMENTED });

    const { stdout } = await run({ cwd: root, report: "json" });

    const report = JSON.parse(stdout) as {
      command: string;
      filesScanned: number;
      problems: number;
      byKind: Record<string, number>;
      tsdocConfig: string | null;
      files: { path: string; problems: { kind: string; message: string }[] }[];
    };

    expect(report.command).toBe("check");
    expect(report.problems).toBeGreaterThan(0);
    expect(report.byKind.missing).toBe(1);
    expect(report.tsdocConfig).toBeNull();
    expect(report.files[0]?.path).toBe(join("src", "b.ts"));
  });

  it("emits a Markdown report", async () => {
    const root = await project({ "src/b.ts": UNDOCUMENTED });

    const { stdout } = await run({ cwd: root, report: "md" });

    expect(stdout).toContain("| Category | Count |");
    expect(stdout).toContain("| Exports without TSDoc | 1 |");
  });
});
