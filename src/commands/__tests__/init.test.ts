import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import initCommand from "@/commands/init";

let root = "";
let eslintPath = "";
let tsdocPath = "";

const eslintConfig = [
  'import js from "@eslint/js";',
  "",
  "export default defineConfig([",
  "  js.configs.recommended,",
  "]);",
  "",
].join("\n");

const sourceFile = [
  "/**",
  " * Adds two numbers.",
  " * @since 0.1.0",
  " */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
].join("\n");

const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

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

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-init-"));
  await mkdir(join(root, "src"), { recursive: true });
  eslintPath = join(root, "eslint.config.mjs");
  tsdocPath = join(root, "tsdoc.json");
  await writeFile(eslintPath, eslintConfig);
  await writeFile(join(root, "src", "math.ts"), sourceFile);
  await writeFile(join(root, "tsconfig.json"), "{}\n");
  await writeFile(join(root, "package-lock.json"), "{}\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ devDependencies: { eslint: "^10.0.0" } }),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("init command", () => {
  it("dry-run reports the plan as JSON without writing", async () => {
    const output = await captureStdout(() =>
      runHandler(initCommand, { cwd: root, "dry-run": true, report: "json" }),
    );

    const report = JSON.parse(output) as {
      wrote: boolean;
      changes: { path: string }[];
      customTags: string[];
      packagesToInstall: string[];
      eslintManualSnippet: string | null;
    };

    expect(report.wrote).toBe(false);
    expect(report.customTags).toContain("@since");
    expect(report.packagesToInstall).toContain("eslint-plugin-tsdoc");
    expect(report.changes.map((change) => change.path)).toContain("tsdoc.json");
    // Config is patchable, so there is no manual snippet.
    expect(report.eslintManualSnippet).toBeNull();
    // Nothing written.
    expect(await fileExists(tsdocPath)).toBe(false);
    expect(await readFile(eslintPath, "utf8")).toBe(eslintConfig);
  });

  it("emits the manual snippet text when the config is unpatchable", async () => {
    await writeFile(eslintPath, "export const notAConfig = 1;\n");

    const output = await captureStdout(() =>
      runHandler(initCommand, { cwd: root, "dry-run": true, report: "json" }),
    );
    const report = JSON.parse(output) as { eslintManualSnippet: string | null };

    expect(typeof report.eslintManualSnippet).toBe("string");
    expect(report.eslintManualSnippet).toContain("eslint-plugin-tsdoc");
  });

  it("writes tsdoc.json and patches the ESLint config by default", async () => {
    await captureStdout(() => runHandler(initCommand, { cwd: root }));

    const tsdoc = JSON.parse(await readFile(tsdocPath, "utf8")) as {
      tagDefinitions: { tagName: string }[];
    };
    expect(tsdoc.tagDefinitions.map((definition) => definition.tagName)).toContain("@since");

    const patched = await readFile(eslintPath, "utf8");
    expect(patched).toContain("eslint-plugin-tsdoc");
    expect(patched).toContain('"tsdoc-require-2/require": "warn"');
  });

  it("uses error severity under --strict", async () => {
    await captureStdout(() => runHandler(initCommand, { cwd: root, strict: true }));

    const patched = await readFile(eslintPath, "utf8");
    expect(patched).toContain('"tsdoc-require-2/require": "error"');
  });

  it("emits a Markdown report with --report=md", async () => {
    const output = await captureStdout(() =>
      runHandler(initCommand, { cwd: root, "dry-run": true, report: "md" }),
    );

    expect(output).toContain("| File | Action |");
    expect(output).toContain("| tsdoc.json | create |");
    expect(output).toContain("| eslint.config.mjs | update |");
    expect(output).toContain("Custom tags registered: @since");
    // Dry-run still writes nothing.
    expect(await fileExists(tsdocPath)).toBe(false);
  });

  it("is a no-op on an already-bootstrapped project", async () => {
    await captureStdout(() => runHandler(initCommand, { cwd: root }));

    const output = await captureStdout(() =>
      runHandler(initCommand, { cwd: root, "dry-run": true, report: "json" }),
    );
    const report = JSON.parse(output) as { changes: unknown[] };
    expect(report.changes).toEqual([]);
  });
});

async function runHandler<T extends ArgsDef>(
  command: CommandDef<T>,
  args: Record<string, unknown>,
): Promise<void> {
  await command.run?.(context(args) as unknown as CommandContext<T>);
}
