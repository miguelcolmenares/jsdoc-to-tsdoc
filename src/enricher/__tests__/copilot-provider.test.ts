import { describe, expect, it, vi } from "vitest";

import {
  createCopilotProvider,
  type ExecFile,
} from "@/enricher/copilot-provider";
import type { EnrichmentTarget } from "@/enricher/types";

const target: EnrichmentTarget = {
  path: "src/greet.ts",
  declaration: {
    name: "greet",
    line: 7,
    kind: "function",
    topology: "stale",
    gaps: [],
    stale: ["@param 'name' is not a parameter of greet (found: userId)"],
  },
};

describe("createCopilotProvider", () => {
  it("returns the trimmed stdout as the suggestion on success", async () => {
    const execFileFn: ExecFile = vi
      .fn()
      .mockResolvedValue({ stdout: "\n/** Greets a user. */\n", stderr: "" });
    const provider = createCopilotProvider(execFileFn);

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({ ok: true, suggestion: "/** Greets a user. */" });
  });

  it("passes the built prompt naming the file and the stale reason to the CLI", async () => {
    const execFileFn: ExecFile = vi
      .fn()
      .mockResolvedValue({ stdout: "suggestion", stderr: "" });
    const provider = createCopilotProvider(execFileFn);

    await provider.suggest(target);

    expect(execFileFn).toHaveBeenCalledWith("copilot", [
      "-p",
      expect.stringContaining("src/greet.ts"),
    ]);
    expect(execFileFn).toHaveBeenCalledWith("copilot", [
      "-p",
      expect.stringContaining(
        "@param 'name' is not a parameter of greet (found: userId)",
      ),
    ]);
  });

  it("reports 'unavailable' when the copilot binary is not on $PATH", async () => {
    const execFileFn: ExecFile = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("spawn copilot ENOENT"), { code: "ENOENT" }),
      );
    const provider = createCopilotProvider(execFileFn);

    const outcome = await provider.suggest(target);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("unavailable");
      expect(outcome.detail).toContain("$PATH");
    }
  });

  it("reports 'error' when the CLI runs but exits non-zero", async () => {
    const execFileFn: ExecFile = vi
      .fn()
      .mockRejectedValue(new Error("Command failed with exit code 1"));
    const provider = createCopilotProvider(execFileFn);

    const outcome = await provider.suggest(target);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("error");
      expect(outcome.detail).toContain("exit code 1");
    }
  });

  it("reports 'error' when the CLI succeeds but prints nothing", async () => {
    const execFileFn: ExecFile = vi
      .fn()
      .mockResolvedValue({ stdout: "   \n", stderr: "" });
    const provider = createCopilotProvider(execFileFn);

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: false,
      reason: "error",
      detail: "the Copilot CLI returned no output.",
    });
  });

  it("is named 'copilot'", () => {
    expect(createCopilotProvider(vi.fn()).name).toBe("copilot");
  });
});
