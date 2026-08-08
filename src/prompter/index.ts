/**
 * `prompter` domain — the interactive per-file review flow for mutating
 * commands.
 *
 * @remarks
 * {@link runInteractive} is the pure orchestrator; {@link promptFileAction} and
 * {@link editInEditor} are the terminal-facing effects it is wired to at the
 * command layer.
 *
 * @packageDocumentation
 * @since 0.1.0
 */

export { editInEditor } from "@/prompter/editor";
export { promptFileAction } from "@/prompter/prompt";
export { runInteractive } from "@/prompter/run-interactive";
export type {
  FileAction,
  FileChange,
  FileView,
  InteractiveEffects,
  InteractiveResult,
} from "@/prompter/types";
