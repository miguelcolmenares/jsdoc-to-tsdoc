/**
 * Uniform failure reporting for the CLI subcommands.
 *
 * @remarks
 * Every command wraps its flow in `try`/`catch` and maps a failure to exit
 * code `1`. Centralising that here keeps the wording consistent and, more
 * importantly, keeps the error extraction correct in one place: a thrown value
 * is not guaranteed to be an `Error`, and reading `.message` off whatever was
 * thrown silently prints `undefined`, losing the only clue the user had.
 *
 * @since 0.1.0
 */

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @param error - Whatever was thrown.
 * @returns The error's message, the string itself when a string was thrown, a
 * JSON rendering for a plain object, or its `String()` form as a last resort.
 *
 * @example
 * ```typescript
 * describeError(new Error("boom")); // "boom"
 * describeError("boom");            // "boom"
 * describeError({ code: "E" });     // '{"code":"E"}'
 * ```
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    // A plain object carries more signal as JSON than as "[object Object]".
    return JSON.stringify(error) ?? String(error);
  } catch {
    // Circular structures and BigInt values make JSON.stringify throw.
    return String(error);
  }
}

/**
 * Writes the standard failure line for a command and sets exit code `1`.
 *
 * @param command - The subcommand name, as it appears in the message.
 * @param error - Whatever was thrown.
 */
export function reportCommandFailure(command: string, error: unknown): void {
  process.stderr.write(
    `jsdoc-to-tsdoc: ${command} failed — ${describeError(error)}\n`,
  );
  process.exitCode = 1;
}
