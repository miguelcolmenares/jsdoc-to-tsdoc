/**
 * Shared types for the interactive per-file review flow.
 *
 * @since 0.1.0
 */

/**
 * What the user chose to do with one changed file.
 *
 * @remarks
 * `accept` writes the proposed output, `skip` leaves the file untouched, `edit`
 * opens the proposal in an editor and writes what the user saves, and `quit`
 * stops the run with the remaining files untouched.
 */
export type FileAction = "accept" | "skip" | "edit" | "quit";

/**
 * One file the run would change, with everything the prompt needs to show it and
 * everything an accept/edit needs to write it.
 */
export interface FileChange {
  /** Display path (relative to the project root). */
  readonly path: string;
  /** Absolute path written on accept or edit. */
  readonly absolutePath: string;
  /** The proposed new file contents. */
  readonly proposed: string;
  /** The pre-rendered colored unified diff (original vs proposed). */
  readonly diff: string;
}

/**
 * The single-file view handed to the prompt: its position in the run and the
 * diff to display.
 */
export interface FileView {
  /** 1-based position of this file in the run. */
  readonly index: number;
  /** Total number of changed files in the run. */
  readonly total: number;
  /** Display path (relative to the project root). */
  readonly path: string;
  /** The pre-rendered colored unified diff to print. */
  readonly diff: string;
}

/**
 * The side effects the orchestrator depends on, injected so the flow can be
 * driven without a real terminal in tests.
 */
export interface InteractiveEffects {
  /**
   * Asks the user what to do with one file.
   *
   * @param view - The file's position and diff.
   * @returns The chosen action.
   */
  prompt(view: FileView): Promise<FileAction>;
  /**
   * Opens the proposed content in an editor and returns what the user saved.
   *
   * @param change - The file being edited.
   * @returns The edited contents to write.
   */
  edit(change: FileChange): Promise<string>;
  /**
   * Persists accepted or edited content.
   *
   * @param absolutePath - The file to write.
   * @param content - The contents to write.
   */
  write(absolutePath: string, content: string): Promise<void>;
}

/**
 * The outcome of an interactive run: which files were written, which were
 * skipped, and whether the user quit early.
 */
export interface InteractiveResult {
  /** Display paths of files written (accepted or edited). */
  readonly written: readonly string[];
  /** Display paths of files the user explicitly skipped. */
  readonly skipped: readonly string[];
  /** Display paths left untouched because the user quit before reaching them. */
  readonly remaining: readonly string[];
  /** Whether the user quit before the end of the run. */
  readonly quit: boolean;
}
