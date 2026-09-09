/**
 * Small helpers shared by the provider adapters for turning a caught,
 * `unknown`-typed error into the `detail` string an {@link EnrichmentOutcome}
 * carries.
 *
 * @since 0.3.0
 */

import type { EnrichmentOutcome } from "@/enricher/types";

/**
 * Renders a caught error as a human-readable string.
 *
 * @remarks
 * A `catch` clause types its parameter `unknown`, and not everything thrown is
 * an `Error` — `child_process` and `fetch` both surface plain objects or
 * strings in some failure modes. This is the one place in the domain that
 * narrows that back to text.
 *
 * @param error - The caught value.
 * @returns `error.message` for an `Error`, otherwise its string coercion.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Checks whether a caught error means "the command was not found", as opposed
 * to the command existing and failing.
 *
 * @remarks
 * `child_process.execFile` reports a missing executable through
 * `error.code === "ENOENT"` rather than a distinct exception type — the same
 * code a missing file would produce, which is why this checks the field
 * directly instead of relying on `instanceof`.
 *
 * @param error - The caught value.
 * @returns `true` when the error carries Node's `ENOENT` code.
 */
export function isMissingCommand(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Builds the `ok: false` branch of an {@link EnrichmentOutcome}.
 *
 * @param reason - Whether the provider could not be reached at all, or was
 * reached and the request itself failed.
 * @param detail - A human-readable explanation, shown in the report.
 * @returns The failure outcome.
 */
export function failure(
  reason: "unavailable" | "error",
  detail: string,
): EnrichmentOutcome {
  return { ok: false, reason, detail };
}
