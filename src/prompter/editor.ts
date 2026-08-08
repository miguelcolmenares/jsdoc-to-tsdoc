/**
 * Opens proposed file content in the user's editor and reads back their edits.
 *
 * @since 0.1.0
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/**
 * Resolves the editor command, preferring `$VISUAL`, then `$EDITOR`, then `vi`.
 *
 * @remarks
 * Each candidate is skipped when unset *or* blank, so a blank `$VISUAL` (a
 * common shell state) falls through to a set `$EDITOR` rather than skipping
 * straight to `vi` — the whole chain is walked, not just the first defined slot.
 *
 * @returns The editor command line to launch.
 */
export function resolveEditor(): string {
  for (const candidate of [process.env.VISUAL, process.env.EDITOR]) {
    if (candidate !== undefined && candidate.trim() !== "") {
      return candidate;
    }
  }
  return "vi";
}

/**
 * Launches the editor on a file and resolves when it exits cleanly.
 *
 * @remarks
 * Waits on `close` (not `exit`) so the editor's inherited stdio is fully flushed
 * first, and reports a signal termination distinctly from a non-zero exit code —
 * `code` is `null` when the process was killed, and a bare "code null" is not
 * actionable. This mirrors `init`'s install runner.
 *
 * @param editor - The editor command line.
 * @param file - The file to open.
 */
function launchEditor(editor: string, file: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // `shell: true` lets `$EDITOR` carry its own arguments (e.g. `code --wait`).
    const child = spawn(editor, [file], { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else if (signal) {
        reject(new Error(`Editor was terminated by signal ${signal}.`));
      } else {
        reject(new Error(`Editor exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

/**
 * Opens `proposed` content in the user's editor and returns what they saved.
 *
 * @remarks
 * The content is written to a throwaway temp file named after the source so the
 * editor applies its syntax mode, opened in the editor, then read back. The temp
 * file is always removed, even when the editor fails.
 *
 * @param path - The source file's path, used only to name the temp file.
 * @param proposed - The proposed content to seed the editor with.
 * @returns The content the user saved.
 */
export async function editInEditor(
  path: string,
  proposed: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jsdoc-to-tsdoc-"));
  const file = join(dir, basename(path));
  try {
    await writeFile(file, proposed, "utf8");
    await launchEditor(resolveEditor(), file);
    return await readFile(file, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
