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
 * @remarks
 * An empty `rows` list yields just the header and divider, so a run with
 * nothing to report still emits a well-formed table rather than a dangling
 * blank row.
 *
 * @param title - Column header for the label column.
 * @param rows - The label/value rows.
 * @param valueLabel - Column header for the value column.
 * @returns A Markdown table string, without a trailing newline.
 */
export function toMarkdownTable(
  title: string,
  rows: readonly SummaryRow[],
  valueLabel = "Count",
): string {
  const header = `| ${title} | ${valueLabel} |`;
  const divider = "| --- | ---: |";
  const body = rows.map((row) => `| ${row.label} | ${row.value} |`);
  return [header, divider, ...body].join("\n");
}
