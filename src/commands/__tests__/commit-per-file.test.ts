import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import convertCommand from "@/commands/convert";
import scaffoldCommand from "@/commands/scaffold";

const run = promisify(execFile);

/** Runs git in `cwd` and returns trimmed stdout. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

const withJsDoc = [
  "/**",
  " * Adds two numbers.",
  " * @param {number} a The first addend.",
  " * @param {number} b The second addend.",
  " * @return {number} The sum.",
  " */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
].join("\n");

const undocumented = [
  "export function ping(): string {",
  '  return "ok";',
  "}",
  "",
].join("\n");

const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}

/** Silences stdout during a command run. */
async function quiet(fn: () => Promise<void>): Promise<void> {
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((): boolean => true);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
}

/** Captures stderr during a command run. */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

let root = "";
let file = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-cpf-"));
  await mkdir(join(root, "src"), { recursive: true });
  file = join(root, "src", "math.ts");
  await writeFile(file, withJsDoc);
  await git(root, "init");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "config", "user.name", "Test");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "chore: baseline");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("convert --commit-per-file", () => {
  it("writes the conversion and commits the file on its own", async () => {
    await quiet(() =>
      runHandler(convertCommand, { cwd: root, "commit-per-file": true }),
    );

    // The file was converted (a JSDoc type brace is gone).
    const after = await readFile(file, "utf8");
    expect(after).toContain("@param a - The first addend.");
    expect(after).not.toContain("{number}");

    // Exactly one commit was added on top of the baseline, naming the file.
    const subjects = (await git(root, "log", "--pretty=%s")).split("\n");
    expect(subjects[0]).toBe("docs: convert JSDoc to TSDoc in src/math.ts");
    expect(subjects).toHaveLength(2);

    // The tree is clean — the write landed inside the commit, nothing dangling.
    expect(await git(root, "status", "--porcelain")).toBe("");
  });

  it("refuses to run on a dirty tree and writes nothing", async () => {
    await writeFile(join(root, "README.md"), "# dirty\n");
    await git(root, "add", "README.md");

    const stderr = await captureStderr(() =>
      runHandler(convertCommand, { cwd: root, "commit-per-file": true }),
    );

    expect(stderr).toMatch(/clean working tree/);
    expect(process.exitCode).toBe(1);
    // The source file was left untouched — the guard ran before any write.
    expect(await readFile(file, "utf8")).toBe(withJsDoc);
  });

  it("refuses to run outside a git repository", async () => {
    const bare = await mkdtemp(join(tmpdir(), "jtt-cpf-nogit-"));
    await mkdir(join(bare, "src"), { recursive: true });
    const bareFile = join(bare, "src", "math.ts");
    await writeFile(bareFile, withJsDoc);

    const stderr = await captureStderr(() =>
      runHandler(convertCommand, { cwd: bare, "commit-per-file": true }),
    );

    expect(stderr).toMatch(/needs a git repository/);
    expect(process.exitCode).toBe(1);
    expect(await readFile(bareFile, "utf8")).toBe(withJsDoc);
    await rm(bare, { recursive: true, force: true });
  });

  it("is rejected when combined with --dry-run", async () => {
    const stderr = await captureStderr(() =>
      runHandler(convertCommand, {
        cwd: root,
        "commit-per-file": true,
        "dry-run": true,
      }),
    );

    expect(stderr).toMatch(/--commit-per-file cannot be combined with/);
    expect(process.exitCode).toBe(1);
    // No commit beyond the baseline.
    expect((await git(root, "log", "--pretty=%s")).split("\n")).toHaveLength(1);
  });
});

describe("scaffold --commit-per-file", () => {
  it("commits each scaffolded file with a stub subject", async () => {
    const target = join(root, "src", "ping.ts");
    await writeFile(target, undocumented);
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "chore: add ping");

    await quiet(() =>
      runHandler(scaffoldCommand, { cwd: root, "commit-per-file": true }),
    );

    const subject = await git(root, "log", "-1", "--pretty=%s");
    expect(subject).toBe("docs: add TSDoc stubs to src/ping.ts");
    expect(await git(root, "status", "--porcelain")).toBe("");
  });
});
