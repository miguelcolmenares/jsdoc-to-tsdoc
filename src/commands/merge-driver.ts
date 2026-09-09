/**
 * @packageDocumentation
 * `merge-driver` subcommand — a git merge driver that resolves a conflict on
 * the `tsdoc-require-2/require` severity line automatically.
 *
 * @remarks
 * This is not part of the four-step migration workflow
 * (`init → convert → scaffold → escalate`); it is invoked by `git` itself,
 * per git's merge-driver file protocol, once a repository wires it up via
 * `.gitattributes` and `git config merge.<name>.driver` (see the README's
 * "Automatic conflict resolution" section under `escalate`).
 *
 * @since 0.3.0
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { defineCommand } from "citty";

import { reportCommandFailure } from "@/commands/command-failure";
import { resolveSeverityConflict } from "@/escalator";
import { writeFileText } from "@/writer";

const run = promisify(execFile);

/**
 * Reads a numeric exit code off a rejected `execFile` promise.
 *
 * @param error - Whatever the rejected promise carried.
 * @returns The process's exit code, or `undefined` when the process never
 * produced one (for example, `git` itself was not on `PATH`).
 */
function exitCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

/**
 * The `merge-driver` command definition.
 *
 * @remarks
 * Implements git's merge-driver file protocol: three positional arguments —
 * the common ancestor, "ours", and "theirs" — naming temporary files git has
 * already populated. On a confident resolution the content is written back
 * to the "ours" path and the command exits `0`, which git reads as a clean
 * merge. Otherwise it defers to `git merge-file` on the same three paths, so
 * the file ends up with the same conflict markers a normal merge (with no
 * driver configured at all) would have produced, and the command's exit code
 * mirrors that fallback's — never a silent, low-confidence guess.
 */
export default defineCommand({
  meta: {
    name: "merge-driver",
    description:
      "Git merge driver for the tsdoc-require-2/require severity line. Not meant to be run by hand — see README.",
  },
  args: {
    base: {
      type: "positional",
      description:
        "Path to the common-ancestor version of the file (git's %O).",
    },
    ours: {
      type: "positional",
      description:
        'Path to the "ours" version (git\'s %A) — overwritten with the result.',
    },
    theirs: {
      type: "positional",
      description: 'Path to the "theirs" version (git\'s %B).',
    },
  },
  async run({ args }) {
    try {
      const basePath = String(args.base);
      const oursPath = String(args.ours);
      const theirsPath = String(args.theirs);

      const [base, ours, theirs] = await Promise.all([
        readFile(basePath, "utf8"),
        readFile(oursPath, "utf8"),
        readFile(theirsPath, "utf8"),
      ]);

      const outcome = resolveSeverityConflict(base, ours, theirs);
      if (outcome.resolved !== null) {
        await writeFileText(oursPath, outcome.resolved);
        process.stdout.write(
          "jsdoc-to-tsdoc merge-driver: resolved the tsdoc-require-2/require severity line.\n",
        );
        return;
      }

      process.stderr.write(
        "jsdoc-to-tsdoc merge-driver: conflict is not limited to the severity line — falling back to `git merge-file`.\n",
      );
      try {
        await run("git", [
          "merge-file",
          "-L",
          "ours",
          "-L",
          "base",
          "-L",
          "theirs",
          oursPath,
          basePath,
          theirsPath,
        ]);
        process.stdout.write(
          "jsdoc-to-tsdoc merge-driver: `git merge-file` resolved it without a conflict.\n",
        );
      } catch (error) {
        process.exitCode = exitCodeOf(error) ?? 1;
      }
    } catch (error) {
      reportCommandFailure("merge-driver", error);
    }
  },
});
