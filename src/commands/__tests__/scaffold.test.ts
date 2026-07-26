import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import scaffoldCommand from "@/commands/scaffold";

let root = "";
let file = "";

const undocumented = [
  "export interface HeroProps {",
  "  title: string;",
  "}",
  "",
  "export function getUser(id: string): string {",
  "  return id;",
  "}",
  "",
].join("\n");

/** Builds a minimal citty context carrying only the parsed args a handler reads. */
const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

/** Captures everything written to stdout during `fn`. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
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

async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-scaffold-"));
  await mkdir(join(root, "src"), { recursive: true });
  file = join(root, "src", "hero.ts");
  await writeFile(file, undocumented);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("scaffold command", () => {
  it("emits a JSON report without writing in dry-run", async () => {
    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, {
        cwd: root,
        "dry-run": true,
        report: "json",
      }),
    );

    const report = JSON.parse(output) as {
      command: string;
      exportsFound: number;
      stubsAdded: number;
      wrote: boolean;
      byKind: Record<string, number>;
    };

    expect(report.command).toBe("scaffold");
    expect(report.exportsFound).toBe(2);
    expect(report.stubsAdded).toBe(2);
    expect(report.wrote).toBe(false);
    expect(report.byKind).toEqual({ interface: 1, function: 1 });
    // Nothing written.
    expect(await readFile(file, "utf8")).toBe(undocumented);
  });

  it("writes stubs by default", async () => {
    await captureStdout(() => runHandler(scaffoldCommand, { cwd: root }));

    const written = await readFile(file, "utf8");
    expect(written).toContain(" * Gets the user.");
    expect(written).toContain(" * Hero props.");
    expect(written).toContain("TODO(tsdoc)");
    // The original code survives untouched.
    expect(written).toContain("export function getUser(id: string): string {");
  });

  it("exits 3 in check mode when an export lacks TSDoc", async () => {
    await captureStdout(() =>
      runHandler(scaffoldCommand, { cwd: root, check: true }),
    );

    expect(process.exitCode).toBe(3);
    // check mode never writes.
    expect(await readFile(file, "utf8")).toBe(undocumented);
  });

  it("leaves the exit code clean when everything is documented", async () => {
    await writeFile(
      file,
      ["/**", " * Documented.", " */", "export const value = 1;", ""].join("\n"),
    );

    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, { cwd: root, check: true }),
    );

    expect(process.exitCode).toBe(0);
    expect(output).toContain("Every export already has TSDoc");
  });

  it("honors the exclude glob", async () => {
    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, {
        cwd: root,
        "dry-run": true,
        report: "json",
        exclude: "**/hero.ts",
      }),
    );

    const report = JSON.parse(output) as { stubsAdded: number };
    expect(report.stubsAdded).toBe(0);
  });

  it("renders a per-kind breakdown in the default table output", async () => {
    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, { cwd: root, "dry-run": true }),
    );

    expect(output).toContain("Exports found");
    expect(output).toContain("Interfaces");
    expect(output).toContain("Functions");
    expect(output).toContain("Preview only");
  });

  it("reports failure and exits 1 for an unreadable project directory", async () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);
    try {
      await runHandler(scaffoldCommand, { cwd: join(root, "missing") });
    } finally {
      spy.mockRestore();
    }

    expect(process.exitCode).toBe(1);
  });
});
