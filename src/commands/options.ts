/**
 * Shared parsing of command-line option values.
 *
 * @since 0.1.0
 */

import type { ReportFormat } from "@/reporter";

/**
 * Splits a comma-separated glob option into a trimmed, non-empty list.
 *
 * @param value - The raw option value (for example `"src/lib/**,src/actions/**"`).
 * @returns The individual glob patterns, or an empty array when unset.
 */
export function splitGlobs(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((glob) => glob.trim())
    .filter((glob) => glob.length > 0);
}

/**
 * Parses the `--report` option into a known {@link ReportFormat}.
 *
 * @param value - The raw option value.
 * @returns The format, or `undefined` for human-oriented default output.
 */
export function parseReportFormat(value: unknown): ReportFormat | undefined {
  if (value === "json" || value === "md" || value === "table") {
    return value;
  }
  return undefined;
}
