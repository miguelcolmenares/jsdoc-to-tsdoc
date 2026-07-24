import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import convertCommand from "@/commands/convert";
import scanCommand from "@/commands/scan";

let root = "";
let file = "";

const dirty = [
  "/**",
  " * Adds two numbers.",
  " * @param {number} a The first addend",
  " * @return {number} the sum",
  " * @async",
  " */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-cmd-"));
  await mkdir(join(root, "src"), { recursive: true });
  file = join(root, "src", "math.ts");
  await writeFile(file, dirty);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("scan command", () => {
  it("emits a JSON inventory without writing", async () => {
    const output = await captureStdout(async () => {
      await runHandler(scanCommand, { cwd: root, report: "json" });
    });

    const report = JSON.parse(output) as { commentsToConvert: number };
    expect(report.commentsToConvert).toBe(1);
    // File left untouched by scan.
    expect(await readFile(file, "utf8")).toBe(dirty);
  });
});

describe("convert command", () => {
  it("dry-run shows a diff and does not write", async () => {
    const output = await captureStdout(async () => {
      await runHandler(convertCommand, { cwd: root, "dry-run": true });
    });

    expect(output).toContain("@returns the sum");
    expect(output).toContain("Preview only");
    expect(await readFile(file, "utf8")).toBe(dirty);
  });

  it("writes converted TSDoc by default", async () => {
    await captureStdout(() => runHandler(convertCommand, { cwd: root }));

    const result = await readFile(file, "utf8");
    expect(result).toContain("@param a - The first addend");
    expect(result).toContain("@returns the sum");
    expect(result).not.toContain("@async");
    expect(result).not.toContain("{number}");
  });

  it("check mode exits 3 when changes remain and never writes", async () => {
    await captureStdout(() =>
      runHandler(convertCommand, { cwd: root, check: true }),
    );

    expect(process.exitCode).toBe(3);
    expect(await readFile(file, "utf8")).toBe(dirty);
  });

  it("honors the exclude filter", async () => {
    await captureStdout(() =>
      runHandler(convertCommand, { cwd: root, exclude: "**/math.ts" }),
    );

    // Excluded file stays dirty.
    expect(await readFile(file, "utf8")).toBe(dirty);
  });
});

/** Invokes a command's `run` handler with a synthetic context. */
async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}
