import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

import mergeDriverCommand from "@/commands/merge-driver";

const roots: string[] = [];

const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

async function run(args: Record<string, unknown>): Promise<Captured> {
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
    await runHandler(mergeDriverCommand, args);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { stdout: stdout.join(""), stderr: stderr.join("") };
}

const config = (severity: string): string =>
  [
    'import tsdoc from "eslint-plugin-tsdoc";',
    "",
    "export default [",
    "  {",
    '    files: ["src/**/*.ts"],',
    "    rules: {",
    `      "tsdoc-require-2/require": "${severity}",`,
    "    },",
    "  },",
    "];",
    "",
  ].join("\n");

async function project(
  base: string,
  ours: string,
  theirs: string,
): Promise<{ base: string; ours: string; theirs: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "jtt-merge-driver-"));
  roots.push(root);
  const paths = {
    base: join(root, "base.mjs"),
    ours: join(root, "ours.mjs"),
    theirs: join(root, "theirs.mjs"),
    root,
  };
  await Promise.all([
    writeFile(paths.base, base, "utf8"),
    writeFile(paths.ours, ours, "utf8"),
    writeFile(paths.theirs, theirs, "utf8"),
  ]);
  return paths;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  process.exitCode = 0;
});

describe("merge-driver command", () => {
  it("resolves a pure severity conflict and overwrites the ours path", async () => {
    const paths = await project(
      config("warn"),
      config("warn"),
      config("error"),
    );

    const { stdout } = await run(paths);

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain(
      "resolved the tsdoc-require-2/require severity line",
    );
    expect(await readFile(paths.ours, "utf8")).toBe(config("error"));
  });

  it("falls back to `git merge-file` and reports failure when another line also conflicts", async () => {
    // Both sides change the `files` line differently, so git's own merge
    // genuinely conflicts there too — not just a case our resolver declines.
    const ours = config("error").replace(
      'files: ["src/**/*.ts"]',
      'files: ["src/**/*.ts", "lib/**/*.ts"]',
    );
    const theirs = config("off").replace(
      'files: ["src/**/*.ts"]',
      'files: ["src/**/*.ts", "test/**/*.ts"]',
    );
    const paths = await project(config("warn"), ours, theirs);

    const { stderr } = await run(paths);

    expect(stderr).toContain("falling back to `git merge-file`");
    expect(process.exitCode).toBeTruthy();
    // git merge-file writes standard conflict markers into the "ours" path.
    expect(await readFile(paths.ours, "utf8")).toContain("<<<<<<<");
  });

  it("reports a command failure when a path does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "jtt-merge-driver-"));
    roots.push(root);

    const { stderr } = await run({
      base: join(root, "missing-base.mjs"),
      ours: join(root, "missing-ours.mjs"),
      theirs: join(root, "missing-theirs.mjs"),
    });

    expect(stderr).toContain("merge-driver failed");
    expect(process.exitCode).toBe(1);
  });
});
