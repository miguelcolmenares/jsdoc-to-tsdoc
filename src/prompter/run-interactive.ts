/**
 * The pure orchestrator for the interactive per-file review flow.
 *
 * @remarks
 * All terminal I/O and file writing arrive as injected {@link InteractiveEffects},
 * so this walk over the changed files is deterministic and testable without a
 * real terminal.
 *
 * @since 0.1.0
 */

import type {
  FileChange,
  InteractiveEffects,
  InteractiveResult,
} from "@/prompter/types";

/**
 * Walks the changed files, prompting for each and applying the chosen action.
 *
 * @remarks
 * `accept` writes the proposal, `edit` writes what the editor returns, `skip`
 * leaves the file untouched, and `quit` stops immediately — files already
 * written stay written and the rest are reported as remaining.
 *
 * @param changes - The files the run would change, in display order.
 * @param effects - The prompt, edit and write side effects.
 * @returns Which files were written, skipped or left remaining, and whether the
 * user quit early.
 */
export async function runInteractive(
  changes: readonly FileChange[],
  effects: InteractiveEffects,
): Promise<InteractiveResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    if (change === undefined) {
      continue;
    }

    const action = await effects.prompt({
      index: index + 1,
      total: changes.length,
      path: change.path,
      diff: change.diff,
    });

    if (action === "quit") {
      return {
        written,
        skipped,
        remaining: changes.slice(index).map((file) => file.path),
        quit: true,
      };
    }

    if (action === "skip") {
      skipped.push(change.path);
      continue;
    }

    const content =
      action === "edit" ? await effects.edit(change) : change.proposed;
    await effects.write(change.absolutePath, content);
    written.push(change.path);
  }

  return { written, skipped, remaining: [], quit: false };
}
