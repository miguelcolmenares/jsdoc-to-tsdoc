/**
 * Enrichment provider backed by the GitHub Copilot CLI (`copilot`), run
 * locally as a subprocess when it is present on `$PATH`.
 *
 * @since 0.3.0
 */

import { execFile } from "node:child_process";

import {
  describeError,
  failure,
  isMissingCommand,
} from "@/enricher/error-utils";
import { buildPrompt } from "@/enricher/prompt";
import type {
  EnrichmentOutcome,
  EnrichmentProvider,
  EnrichmentTarget,
} from "@/enricher/types";

/**
 * The slice of `child_process.execFile` this provider calls, promisified and
 * narrowed to what it needs — a command, its arguments, and the captured
 * stdout.
 *
 * @remarks
 * Injected so a test can substitute a fake process instead of spawning a real
 * `copilot` binary, per this domain's no-real-subprocess-in-tests rule.
 */
export type ExecFile = (
  command: string,
  args: readonly string[],
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024;

/**
 * The real `execFile`, wrapped as a promise.
 *
 * @param command - The executable to run.
 * @param args - Its arguments.
 * @returns The captured stdout and stderr.
 */
function realExecFile(
  command: string,
  args: readonly string[],
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      [...args],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise({ stdout, stderr });
      },
    );
  });
}

/**
 * Builds a provider that asks the GitHub Copilot CLI for a suggestion.
 *
 * @remarks
 * Invokes `copilot -p <prompt>` non-interactively and reads the suggestion
 * from stdout. A missing binary (`ENOENT`) is reported as `"unavailable"`; a
 * binary that runs but exits non-zero, times out, or prints nothing is
 * reported as `"error"` — it was reached, the request itself did not succeed.
 *
 * @param execFileFn - The subprocess runner. Defaults to the real
 * `child_process.execFile`; tests inject a fake.
 * @returns The `copilot` {@link EnrichmentProvider}.
 */
export function createCopilotProvider(
  execFileFn: ExecFile = realExecFile,
): EnrichmentProvider {
  return {
    name: "copilot",
    async suggest(target: EnrichmentTarget): Promise<EnrichmentOutcome> {
      const prompt = buildPrompt(target);
      try {
        const { stdout } = await execFileFn("copilot", ["-p", prompt]);
        const suggestion = stdout.trim();
        if (suggestion === "") {
          return failure("error", "the Copilot CLI returned no output.");
        }
        return { ok: true, suggestion };
      } catch (error) {
        if (isMissingCommand(error)) {
          return failure(
            "unavailable",
            "the `copilot` command was not found on $PATH. Install the " +
              "GitHub Copilot CLI to use --enrich=copilot.",
          );
        }
        return failure("error", describeError(error));
      }
    },
  };
}
