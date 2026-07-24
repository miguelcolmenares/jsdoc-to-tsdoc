/**
 * Machine-readable report rendering (`--report=json` / `--report=md`).
 *
 * @since 0.1.0
 */

import type { SummaryRow } from "@/reporter/summary-reporter";

/**
 * Serializes an arbitrary payload as pretty-printed JSON for CI consumption.
 *
 * @param payload - The data to serialize.
 * @returns A JSON string with two-space indentation.
 */
export function toJsonReport(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Renders summary rows as a GitHub-flavored Markdown table.
 *
 * @param title - Column header for the label column.
 * @param rows - The label/value rows.
 * @returns A Markdown table string.
 */
export function toMarkdownTable(
  title: string,
  rows: readonly SummaryRow[],
): string {
  const header = `| ${title} | Count |`;
  const divider = "| --- | ---: |";
  const body = rows.map((row) => `| ${row.label} | ${row.value} |`);
  return [header, divider, ...body].join("\n");
}
