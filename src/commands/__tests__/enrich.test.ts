import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArgsDef, CommandContext, CommandDef } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as EnricherModule from "@/enricher";
import type { EnrichmentProvider } from "@/enricher/types";

// Spies on every entry point `scan` has into the `enricher` domain, wrapping
// (not replacing) the real implementations so `selectEnrichmentTargets` and
// `enrichTargets` still run for real in the report-shape tests below — only
// `createEnrichmentProvider`, the one function that would otherwise build a
// real subprocess/fetch/SDK adapter, is fully replaced per test. This is what
// lets the opt-in gating test below prove a negative with certainty: if
// `--enrich` is absent, none of these three functions run at all, not merely
// "the real provider's I/O did not happen to fire".
const mocks = vi.hoisted(() => ({
  createEnrichmentProvider: vi.fn<(name: string) => EnrichmentProvider>(),
}));

vi.mock("@/enricher", async (importOriginal) => {
  const actual = await importOriginal<typeof EnricherModule>();
  return {
    ...actual,
    createEnrichmentProvider: mocks.createEnrichmentProvider,
    selectEnrichmentTargets: vi.fn(actual.selectEnrichmentTargets),
    enrichTargets: vi.fn(actual.enrichTargets),
  };
});

const enricherModule = await import("@/enricher");
const scanCommand = (await import("@/commands/scan")).default;

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

/** Runs `scan` with the given args and returns stdout/stderr plus the exit code. */
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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-enrich-"));
  await mkdir(join(root, "src"), { recursive: true });
  mocks.createEnrichmentProvider.mockReset();
  vi.mocked(enricherModule.createEnrichmentProvider).mockClear();
  vi.mocked(enricherModule.selectEnrichmentTargets).mockClear();
  vi.mocked(enricherModule.enrichTargets).mockClear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scan --enrich opt-in gating", () => {
  // The single most important test in this feature: the deterministic
  // pipeline (and scan --classify's report) must stay fully usable with zero
  // LLM dependency, per AGENTS.md §4 decision #9. Omitting --enrich must never
  // reach into the enricher domain at all — not "reach it but no-op".
  it("never calls into the enricher domain when --enrich is not passed", async () => {
    await write("src/greet.ts", stale);

    const { output, errors } = await run({ classify: true });

    expect(output).toContain("Documentation analysis");
    expect(errors).toBe("");
    expect(enricherModule.createEnrichmentProvider).not.toHaveBeenCalled();
    expect(enricherModule.selectEnrichmentTargets).not.toHaveBeenCalled();
    expect(enricherModule.enrichTargets).not.toHaveBeenCalled();
  });

  it("never calls into the enricher domain for the plain (non-classify) inventory", async () => {
    await write("src/greet.ts", stale);

    await run({});

    expect(enricherModule.createEnrichmentProvider).not.toHaveBeenCalled();
    expect(enricherModule.selectEnrichmentTargets).not.toHaveBeenCalled();
    expect(enricherModule.enrichTargets).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized --enrich value without calling the enricher", async () => {
    await write("src/greet.ts", stale);

    const { errors, exitCode } = await run({ enrich: "chatgpt" });

    expect(exitCode).toBe(1);
    expect(errors).toContain('unknown --enrich "chatgpt"');
    expect(enricherModule.createEnrichmentProvider).not.toHaveBeenCalled();
  });

  it("--enrich implies --classify", async () => {
    await write("src/greet.ts", stale);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi.fn().mockResolvedValue({ ok: true, suggestion: "doc" }),
    }));

    const { output } = await run({ enrich: "ollama" });

    expect(output).toContain("Documentation analysis");
  });
});

describe("scan --enrich report shape", () => {
  it("adds an additive `enrichment` field to the flagged declaration in --report=json, and none to others", async () => {
    await write("src/greet.ts", stale);
    await write("src/math.ts", documented);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi
        .fn()
        .mockResolvedValue({ ok: true, suggestion: "/** Greets. */" }),
    }));

    const { output } = await run({ enrich: "ollama", report: "json" });
    const report: {
      files: {
        path: string;
        declarations: {
          name: string;
          topology: string;
          enrichment?: { ok: boolean; suggestion?: string };
        }[];
      }[];
    } = JSON.parse(output);

    const greetFile = report.files.find((f) => f.path === "src/greet.ts");
    const mathFile = report.files.find((f) => f.path === "src/math.ts");
    expect(greetFile?.declarations[0]?.enrichment).toEqual({
      ok: true,
      suggestion: "/** Greets. */",
    });
    // Untargeted declarations (valid topology) keep their existing shape —
    // the field is additive and only appears on what --enrich actually asked
    // a provider about.
    expect(mathFile?.declarations[0]?.enrichment).toBeUndefined();
    expect(mathFile?.declarations[0]?.topology).toBe("valid");
  });

  it("prints suggestions and does not crash when the provider is unavailable", async () => {
    await write("src/greet.ts", stale);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi.fn().mockResolvedValue({
        ok: false,
        reason: "unavailable",
        detail: "Ollama is not reachable at http://localhost:11434",
      }),
    }));

    const { output, exitCode } = await run({ enrich: "ollama" });

    expect(exitCode).toBeUndefined();
    expect(output).toContain("Documentation analysis");
    expect(output).toContain("Enrichment unavailable for 1 entry");
    expect(output).toContain("Ollama is not reachable");
  });

  it("prints a suggestion in the human report", async () => {
    await write("src/greet.ts", stale);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi
        .fn()
        .mockResolvedValue({ ok: true, suggestion: "/** Greets a user. */" }),
    }));

    const { output } = await run({ enrich: "ollama" });

    expect(output).toContain("Enrichment (--enrich=ollama)");
    expect(output).toContain("greet");
    expect(output).toContain("/** Greets a user. */");
  });

  it("adds an Enrichment section to --report=md without touching the topology table", async () => {
    await write("src/greet.ts", stale);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi
        .fn()
        .mockResolvedValue({ ok: true, suggestion: "/** Greets a user. */" }),
    }));

    const { output } = await run({ enrich: "ollama", report: "md" });

    expect(output).toContain("| Topology | Files |");
    expect(output).toContain("### Enrichment (`--enrich=ollama`)");
    expect(output).toContain("/** Greets a user. */");
  });

  it("says nothing about enrichment when nothing was flagged", async () => {
    await write("src/math.ts", documented);
    mocks.createEnrichmentProvider.mockImplementation(() => ({
      name: "ollama",
      suggest: vi.fn(),
    }));

    const { output } = await run({ enrich: "ollama" });

    expect(output).not.toContain("Enrichment");
    const suggestSpy = mocks.createEnrichmentProvider.mock.results[0]?.value as
      EnrichmentProvider | undefined;
    expect(suggestSpy?.suggest).not.toHaveBeenCalled();
  });
});
