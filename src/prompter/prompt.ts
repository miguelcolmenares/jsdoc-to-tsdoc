/**
 * The `@clack/prompts`-backed prompt for the interactive per-file review flow.
 *
 * @remarks
 * `@clack/prompts` is imported lazily so the dependency is loaded only when a run
 * is actually interactive, keeping cold CLI startup fast.
 *
 * @since 0.1.0
 */

import type { FileAction, FileView } from "@/prompter/types";

/**
 * Prints a file's diff and asks the user what to do with it.
 *
 * @remarks
 * A cancel (Ctrl+C) is treated as `quit` so an interrupted run stops cleanly
 * with the remaining files untouched rather than throwing.
 *
 * @param view - The file's position in the run and its rendered diff.
 * @returns The chosen action.
 */
export async function promptFileAction(view: FileView): Promise<FileAction> {
  const clack = await import("@clack/prompts");

  process.stdout.write(`\n${view.diff}\n`);

  const choice = await clack.select({
    message: `[${String(view.index)}/${String(view.total)}] ${view.path}`,
    options: [
      { value: "accept", label: "accept", hint: "write this file" },
      { value: "skip", label: "skip", hint: "leave it unchanged" },
      { value: "edit", label: "edit", hint: "open in $EDITOR before writing" },
      { value: "quit", label: "quit", hint: "stop here" },
    ],
  });

  if (clack.isCancel(choice)) {
    return "quit";
  }
  // A defensive invariant rather than a cast: the selection must be one of the
  // declared option values, so anything else is a programmer error (or a library
  // behavior change) that should fail loudly instead of slipping through.
  if (
    choice === "accept" ||
    choice === "skip" ||
    choice === "edit" ||
    choice === "quit"
  ) {
    return choice;
  }
  throw new Error(`Unexpected interactive selection: ${String(choice)}`);
}
