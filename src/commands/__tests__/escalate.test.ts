import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

import escalateCommand from "@/commands/escalate";
import {
  createEslintProject,
  DOCUMENTED_SOURCE,
  UNDOCUMENTED_SOURCE,
} from "@/escalator/__tests__/eslint-project";

const roots: string[] = [];

async function project(
  options: Parameters<typeof createEslintProject>[0] = {},
): Promise<string> {
  const root = await createEslintProject(options);
  roots.push(root);
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

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs `escalate` with `--severity` defaulted the way citty would, capturing
 * both streams: failures and blocked runs report on stderr.
 */
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
    await runHandler(escalateCommand, { severity: "error", ...args });
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { stdout: stdout.join(""), stderr: stderr.join("") };
}

const readConfig = (root: string): Promise<string> =>
  readFile(join(root, "eslint.config.mjs"), "utf8");

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  process.exitCode = 0;
});

describe("escalate command", () => {
  it("escalates to error once the preflight is clean", async () => {
    const root = await project();

    const { stdout } = await run({ cwd: root });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("Preflight");
    expect(stdout).toContain('"warn" → "error"');
    expect(await readConfig(root)).toContain(
      '"tsdoc-require-2/require": "error",',
    );
  });

  it("leaves the test-file override disabled", async () => {
    const root = await project();

    await run({ cwd: root });

    // The second config block exempts `__tests__/`; escalation must not enable
    // the rule there.
    expect(await readConfig(root)).toContain(
      'rules: { "tsdoc-require-2/require": "off" },',
    );
  });

  it("blocks on undocumented exports and writes nothing", async () => {
    const root = await project({ files: { "src/b.ts": UNDOCUMENTED_SOURCE } });
    const before = await readConfig(root);

    const { stderr } = await run({ cwd: root });

    expect(process.exitCode).toBe(3);
    expect(stderr).toContain("1 export(s) still reported");
    expect(stderr).toContain("b.ts");
    expect(stderr).toContain("scaffold");
    expect(await readConfig(root)).toBe(before);
  });

  it("escalates anyway under --skip-preflight", async () => {
    const root = await project({ files: { "src/b.ts": UNDOCUMENTED_SOURCE } });

    const { stdout } = await run({ cwd: root, "skip-preflight": true });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).not.toContain("Preflight");
    expect(await readConfig(root)).toContain(
      '"tsdoc-require-2/require": "error",',
    );
  });

  it("exits 3 under --check when the rule is not escalated yet", async () => {
    const root = await project();
    const before = await readConfig(root);

    const { stdout } = await run({ cwd: root, check: true });

    expect(process.exitCode).toBe(3);
    expect(stdout).toContain("Preview only");
    expect(await readConfig(root)).toBe(before);
  });

  it("exits 0 under --check once the rule is already at error", async () => {
    const root = await project({ severity: "error" });

    const { stdout } = await run({ cwd: root, check: true });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain("already sets");
  });

  it("shows a diff under --dry-run without writing", async () => {
    const root = await project();
    const before = await readConfig(root);

    const { stdout } = await run({ cwd: root, "dry-run": true });

    expect(process.exitCode).toBeFalsy();
    expect(stdout).toContain('-      "tsdoc-require-2/require": "warn",');
    expect(stdout).toContain('+      "tsdoc-require-2/require": "error",');
    expect(await readConfig(root)).toBe(before);
  });

  it("walks an escalation back with --severity warn", async () => {
    const root = await project({ severity: "error" });

    await run({ cwd: root, severity: "warn" });

    expect(await readConfig(root)).toContain(
      '"tsdoc-require-2/require": "warn",',
    );
  });

  it("rejects an unknown --severity", async () => {
    const root = await project();

    const { stderr } = await run({ cwd: root, severity: "loud" });

    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("Unknown --severity");
    expect(await readConfig(root)).toContain('"tsdoc-require-2/require": "warn",');
  });

  it("fails when no ESLint config is present", async () => {
    const root = await project({ withConfig: false });

    const { stderr } = await run({ cwd: root });

    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("No ESLint flat config found");
  });

  it("fails when the presence rule is not configured", async () => {
    const root = await project();
    await writeFile(join(root, "eslint.config.mjs"), "export default [];\n");

    const { stderr } = await run({ cwd: root });

    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("is not configured");
  });

  it("refuses to escalate when the preflight cannot run", async () => {
    // A config but no resolvable ESLint: the check is unavailable, which is not
    // the same as the project being clean.
    const bare = await mkdtemp(join(tmpdir(), "jtt-escalate-bare-"));
    roots.push(bare);
    await writeFile(
      join(bare, "eslint.config.mjs"),
      'export default [{ rules: { "tsdoc-require-2/require": "warn" } }];\n',
    );

    const { stderr } = await run({ cwd: bare });

    expect(process.exitCode).toBe(1);
    expect(stderr).toContain("ESLint could not be loaded");
    expect(stderr).toContain("--skip-preflight");
    expect(await readFile(join(bare, "eslint.config.mjs"), "utf8")).toContain(
      '"warn"',
    );
  });

  it("emits a JSON report", async () => {
    const root = await project({ files: { "src/a.ts": DOCUMENTED_SOURCE } });

    const { stdout } = await run({ cwd: root, report: "json" });

    const report = JSON.parse(stdout) as {
      command: string;
      status: string;
      wrote: boolean;
      configPath: string;
      occurrences: { line: number; from: string }[];
      preflight: { status: string; violations: unknown[] } | null;
      reason: string | null;
    };

    expect(report.command).toBe("escalate");
    expect(report.status).toBe("escalated");
    expect(report.wrote).toBe(true);
    expect(report.configPath).toBe("eslint.config.mjs");
    expect(report.occurrences[0]?.from).toBe("warn");
    expect(report.preflight?.status).toBe("clean");
    expect(report.reason).toBeNull();
  });

  it("reports blocking violations as relative paths in JSON", async () => {
    const root = await project({ files: { "src/b.ts": UNDOCUMENTED_SOURCE } });

    const { stdout } = await run({ cwd: root, report: "json" });

    const report = JSON.parse(stdout) as {
      status: string;
      preflight: { violations: { path: string; line: number }[] } | null;
    };

    expect(process.exitCode).toBe(3);
    expect(report.status).toBe("blocked");
    expect(report.preflight?.violations[0]?.path).toBe(join("src", "b.ts"));
  });

  it("emits a Markdown report", async () => {
    const root = await project();

    const { stdout } = await run({ cwd: root, report: "md", "dry-run": true });

    expect(stdout).toContain("| Field | Value |");
    expect(stdout).toContain("| Status | would-change |");
    expect(stdout).toContain("| Rule | tsdoc-require-2/require |");
    expect(stdout).toContain("| Assignments updated | 1 |");
  });
});
