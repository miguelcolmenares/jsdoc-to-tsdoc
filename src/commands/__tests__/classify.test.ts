import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import scanCommand from "@/commands/scan";

let root = "";

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

/** Writes a file under the temp project. */
async function write(relativePath: string, contents: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, contents);
}

/** Invokes a command's `run` handler with a synthetic context. */
async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}

/** Captures everything written to stderr during `fn`. */
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

/** Runs `scan` with the given args and returns stdout plus the exit code. */
async function run(
  args: Record<string, unknown>,
): Promise<{ output: string; errors: string; exitCode: number | undefined }> {
  process.exitCode = undefined;
  let output = "";
  const errors = await captureStderr(async () => {
    output = await captureStdout(async () => {
      await runHandler(scanCommand, { cwd: root, ...args });
    });
  });
  const { exitCode } = process;
  process.exitCode = undefined;
  return { output, errors, exitCode };
}

const documented = [
  "/**",
  " * Adds one.",
  " *",
  " * @param a - The addend.",
  " * @returns The sum.",
  " */",
  "export function inc(a: number): number { return a + 1; }",
  "",
].join("\n");

const stale = [
  "/**",
  " * Greets someone.",
  " *",
  " * @param name - Who to greet.",
  " * @returns The greeting.",
  " */",
  "export function greet(userId: string): string { return userId; }",
  "",
].join("\n");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-classify-"));
  await mkdir(join(root, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scan --classify", () => {
  it("reports the topology table and stays silent about clean files", async () => {
    await write("src/math.ts", documented);

    const { output, exitCode } = await run({ classify: true });

    expect(output).toContain("Documentation analysis — 1 file(s) scanned");
    expect(output).toContain("Valid TSDoc");
    expect(output).toContain("ready for `convert`");
    expect(output).not.toContain("Stale documentation");
    expect(exitCode).toBeUndefined();
  });

  it("names the declaration and the reason for each stale comment", async () => {
    await write("src/greet.ts", stale);

    const { output } = await run({ classify: true });

    expect(output).toContain("Stale documentation — review these by hand:");
    expect(output).toContain("greet.ts:7");
    expect(output).toContain(
      "@param 'name' is not a parameter of greet (found: userId)",
    );
  });

  it("emits a machine-readable classification with --report=json", async () => {
    await write("src/math.ts", documented);
    await write("src/greet.ts", stale);

    const { output } = await run({ classify: true, report: "json" });
    const report: {
      mode: string;
      filesScanned: number;
      byTopology: Record<string, number>;
      byConfidence: Record<string, number>;
      files: { path: string; topology: string }[];
    } = JSON.parse(output);

    expect(report.mode).toBe("classify");
    expect(report.filesScanned).toBe(2);
    expect(report.byTopology).toMatchObject({ valid: 1, stale: 1 });
    expect(report.byConfidence).toMatchObject({ high: 1, stale: 1 });
    expect(report.files.map((file) => file.topology).sort()).toEqual([
      "stale",
      "valid",
    ]);
  });

  it("renders a markdown table with --report=md", async () => {
    await write("src/math.ts", documented);

    const { output } = await run({ classify: true, report: "md" });

    expect(output).toContain("| Topology | Files |");
    expect(output).toContain("| Valid TSDoc | 1 |");
  });

  it("counts files that export nothing separately from valid ones", async () => {
    await write("src/math.ts", documented);
    await write("src/constants.ts", "const internal = 1;\n");

    const { output } = await run({ classify: true, report: "json" });
    const report: { filesScanned: number; filesWithoutExports: number } =
      JSON.parse(output);

    expect(report.filesScanned).toBe(2);
    expect(report.filesWithoutExports).toBe(1);
  });

  // `init` writes an ESLint config that turns both TSDoc rules off for test
  // paths, so classifying them would report work the tool itself excuses.
  it("skips test files by default and includes them on request", async () => {
    await write("src/math.ts", documented);
    await write("src/math.test.ts", "export function helper(): void {}\n");

    const byDefault: {
      filesScanned: number;
      byTopology: Record<string, number>;
    } = JSON.parse((await run({ classify: true, report: "json" })).output);
    expect(byDefault.filesScanned).toBe(1);
    expect(byDefault.byTopology["no-docs"]).toBe(0);

    const withTests: {
      filesScanned: number;
      byTopology: Record<string, number>;
    } = JSON.parse(
      (
        await run({
          classify: true,
          report: "json",
          "include-tests": true,
        })
      ).output,
    );
    expect(withTests.filesScanned).toBe(2);
    expect(withTests.byTopology["no-docs"]).toBe(1);
  });

  it("leaves the default inventory untouched without --classify", async () => {
    await write("src/math.ts", documented);

    const { output } = await run({ report: "json" });
    const report: { command: string; mode?: string; filesScanned: number } =
      JSON.parse(output);

    expect(report.command).toBe("scan");
    expect(report.mode).toBeUndefined();
    expect(report.filesScanned).toBe(1);
  });

  // `--lite` only narrows the conversion inventory. Ignoring it in silence
  // would let a CI job read the classification as the narrower set it asked for.
  it("says so when --lite is passed alongside --classify", async () => {
    await write("src/math.ts", documented);

    const { errors, output } = await run({ classify: true, lite: true });

    expect(errors).toContain("--lite");
    expect(errors).toContain("no effect with --classify");
    expect(output).toContain("Documentation analysis");

    const quiet = await run({ classify: true });
    expect(quiet.errors).toBe("");
  });
});

describe("scan gates", () => {
  it("--fail-on-missing exits 3 when an export has no TSDoc", async () => {
    await write(
      "src/math.ts",
      "export function inc(a: number): number { return a; }\n",
    );

    const { exitCode } = await run({ "fail-on-missing": true });
    expect(exitCode).toBe(3);
  });

  it("--fail-on-missing counts `//` prose as missing", async () => {
    await write(
      "src/math.ts",
      "// Adds one.\nexport function inc(a: number): number { return a; }\n",
    );

    const { exitCode, output } = await run({ "fail-on-missing": true });
    expect(exitCode).toBe(3);
    expect(output).toContain("Line comments");
  });

  it("--fail-on-missing passes when everything is documented", async () => {
    await write("src/math.ts", documented);

    const { exitCode } = await run({ "fail-on-missing": true });
    expect(exitCode).toBeUndefined();
  });

  it("--fail-on-stale exits 3 only for contradictions, not for gaps", async () => {
    await write("src/greet.ts", stale);
    expect((await run({ "fail-on-stale": true })).exitCode).toBe(3);

    await rm(join(root, "src", "greet.ts"));
    await write(
      "src/partial.ts",
      [
        "/**",
        " * Adds.",
        " */",
        "export function inc(a: number): number { return a; }",
        "",
      ].join("\n"),
    );
    expect((await run({ "fail-on-stale": true })).exitCode).toBeUndefined();
  });

  it("a gate implies --classify, so the report is the classification", async () => {
    await write("src/math.ts", documented);

    const { output } = await run({ "fail-on-missing": true });
    expect(output).toContain("Documentation analysis");
  });
});
