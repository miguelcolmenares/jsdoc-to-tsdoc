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
  // The regression: `scaffold` used to write TODO(tsdoc) stubs into test files
  // whose TSDoc rules the config `init` generates turns off. That made
  // `check`'s own remediation line — "Run `jsdoc-to-tsdoc scaffold`" —
  // overshoot the gate that printed it, since `check` never looks at those
  // files.
  it("leaves test files alone by default", async () => {
    await mkdir(join(root, "src", "__tests__"), { recursive: true });
    const inTests = join(root, "src", "__tests__", "hero.test.ts");
    const sibling = join(root, "src", "other.test.ts");
    await writeFile(inTests, undocumented);
    await writeFile(sibling, undocumented);

    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, { cwd: root, report: "json" }),
    );
    const report = JSON.parse(output) as { exportsFound: number };

    // Only src/hero.ts is scaffolded; both test files are untouched on disk.
    expect(report.exportsFound).toBe(2);
    expect(await readFile(inTests, "utf8")).toBe(undocumented);
    expect(await readFile(sibling, "utf8")).toBe(undocumented);
  });

  it("stubs test files under --include-tests", async () => {
    await mkdir(join(root, "src", "__tests__"), { recursive: true });
    const inTests = join(root, "src", "__tests__", "hero.test.ts");
    await writeFile(inTests, undocumented);

    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, {
        cwd: root,
        "include-tests": true,
        report: "json",
      }),
    );
    const report = JSON.parse(output) as { exportsFound: number };

    expect(report.exportsFound).toBe(4);
    expect(await readFile(inTests, "utf8")).not.toBe(undocumented);
  });

  // --exclude is additive with the default exemption, not a replacement for
  // it: passing one glob must not silently re-admit the test tree.
  it("keeps the test exemption when --exclude is also passed", async () => {
    await mkdir(join(root, "src", "__tests__"), { recursive: true });
    const inTests = join(root, "src", "__tests__", "hero.test.ts");
    const skipped = join(root, "src", "skip-me.ts");
    await writeFile(inTests, undocumented);
    await writeFile(skipped, undocumented);

    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, {
        cwd: root,
        exclude: "src/skip-me.ts",
        report: "json",
      }),
    );
    const report = JSON.parse(output) as { exportsFound: number };

    expect(report.exportsFound).toBe(2);
    expect(await readFile(inTests, "utf8")).toBe(undocumented);
    expect(await readFile(skipped, "utf8")).toBe(undocumented);
  });

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
      ["/**", " * Documented.", " */", "export const value = 1;", ""].join(
        "\n",
      ),
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

  it("labels the variable kind neutrally, since let and var also land there", async () => {
    await writeFile(file, "export let counter = 0;\nexport var legacy = 1;\n");

    const output = await captureStdout(() =>
      runHandler(scaffoldCommand, { cwd: root, "dry-run": true }),
    );

    // "Constants" would misdescribe `export let` / `export var`.
    expect(output).toContain("Variables");
    expect(output).not.toContain("Constants");
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

  describe("when a doc-shaped comment is stranded above the previous statement", () => {
    const withOrphanedComment = [
      "/**",
      " * Sends a GraphQL query to the WordPress API.",
      " *",
      " * @param query - GraphQL query string",
      " * @returns Response data",
      " */",
      "/** Request timeout for WordPress API calls (ms). */",
      "const WP_API_TIMEOUT_MS = 10_000;",
      "",
      "export const fetchWPAPI = async (query: string) => query;",
      "",
    ].join("\n");

    beforeEach(async () => {
      await writeFile(file, withOrphanedComment);
    });

    it("does not write a duplicate stub next to the real doc comment", async () => {
      const output = await captureStdout(() =>
        runHandler(scaffoldCommand, { cwd: root }),
      );

      expect(await readFile(file, "utf8")).toBe(withOrphanedComment);
      expect(output).toContain("skipped");
      expect(output).toContain("fetchWPAPI");
      expect(output).toContain(
        "doesn't attach to any export; move it directly above",
      );
    });

    it("fails --check instead of silently passing", async () => {
      await captureStdout(() =>
        runHandler(scaffoldCommand, { cwd: root, check: true }),
      );

      expect(process.exitCode).toBe(3);
    });

    it("includes the warning in a JSON report", async () => {
      const output = await captureStdout(() =>
        runHandler(scaffoldCommand, {
          cwd: root,
          "dry-run": true,
          report: "json",
        }),
      );

      const report = JSON.parse(output) as {
        orphanedWarnings: { name: string; line: number; orphanLine: number }[];
      };
      expect(report.orphanedWarnings).toEqual([
        { path: "src/hero.ts", name: "fetchWPAPI", line: 10, orphanLine: 1 },
      ]);
    });
  });

  describe("--members", () => {
    it("does not stub interface members by default", async () => {
      await captureStdout(() => runHandler(scaffoldCommand, { cwd: root }));

      const written = await readFile(file, "utf8");
      expect(written).toContain(" * Hero props.");
      expect(written).not.toContain(" * Title.");
    });

    it("stubs every undocumented member when passed", async () => {
      await captureStdout(() =>
        runHandler(scaffoldCommand, { cwd: root, members: true }),
      );

      const written = await readFile(file, "utf8");
      expect(written).toContain(" * Hero props.");
      expect(written).toContain(" * Title.");
    });

    it("reports memberStubsAdded in the JSON report", async () => {
      const output = await captureStdout(() =>
        runHandler(scaffoldCommand, {
          cwd: root,
          "dry-run": true,
          members: true,
          report: "json",
        }),
      );

      const report = JSON.parse(output) as {
        stubsAdded: number;
        memberStubsAdded: number;
      };
      expect(report.stubsAdded).toBe(2);
      expect(report.memberStubsAdded).toBe(1);
      // Preview only — nothing written.
      expect(await readFile(file, "utf8")).toBe(undocumented);
    });

    it("fails --check on an undocumented member even when the header is documented", async () => {
      await writeFile(
        file,
        [
          "/**",
          " * Hero props.",
          " */",
          "export interface HeroProps {",
          "  title: string;",
          "}",
          "",
        ].join("\n"),
      );

      await captureStdout(() =>
        runHandler(scaffoldCommand, { cwd: root, check: true, members: true }),
      );

      expect(process.exitCode).toBe(3);
    });

    it("does not fail --check without --members even when a member is undocumented", async () => {
      await writeFile(
        file,
        [
          "/**",
          " * Hero props.",
          " */",
          "export interface HeroProps {",
          "  title: string;",
          "}",
          "",
        ].join("\n"),
      );

      const output = await captureStdout(() =>
        runHandler(scaffoldCommand, { cwd: root, check: true }),
      );

      expect(process.exitCode).toBe(0);
      expect(output).toContain("Every export already has TSDoc");
    });
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
