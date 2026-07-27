/**
 * Human-readable table and summary rendering.
 *
 * @since 0.1.0
 */

import type { Colors } from "@/reporter/colors";

/**
 * Supported machine-readable report formats. When no format is selected the
 * commands emit their default human-oriented output (tables and diffs).
 */
export type ReportFormat = "json" | "md";

/**
 * A single labelled row in a two-column summary table.
 */
export interface SummaryRow {
  /** The row label. */
  readonly label: string;
  /** The row value. */
  readonly value: string | number;
}

/**
 * Renders a bordered two-column table.
 *
 * @param rows - The label/value rows to render.
 * @param colors - Style functions for the border and labels.
 * @returns A multi-line string containing the boxed table.
 */
export function formatTable(
  rows: readonly SummaryRow[],
  colors: Colors,
): string {
  const labelWidth = Math.max(8, ...rows.map((row) => row.label.length));
  const valueWidth = Math.max(
    5,
    ...rows.map((row) => String(row.value).length),
  );

  const horizontal = (left: string, mid: string, right: string): string =>
    colors.dim(
      `${left}${"─".repeat(labelWidth + 2)}${mid}${"─".repeat(valueWidth + 2)}${right}`,
    );

  const lines: string[] = [horizontal("┌", "┬", "┐")];
  for (const { label, value } of rows) {
    const paddedLabel = label.padEnd(labelWidth);
    const paddedValue = String(value).padStart(valueWidth);
    const bar = colors.dim("│");
    lines.push(`${bar} ${paddedLabel} ${bar} ${paddedValue} ${bar}`);
  }
  lines.push(horizontal("└", "┴", "┘"));
  return lines.join("\n");
}

/**
 * Renders a one-line summary of a `convert` run.
 *
 * @param params - Aggregate counts from the run.
 * @param colors - Style functions.
 * @returns A single formatted summary line.
 */
export function formatConvertSummary(
  params: {
    readonly filesScanned: number;
    readonly filesChanged: number;
    readonly commentsChanged: number;
    readonly membersDocumented: number;
    readonly wrote: boolean;
  },
  colors: Colors,
): string {
  const { filesScanned, filesChanged, commentsChanged, membersDocumented, wrote } =
    params;
  const verb = wrote ? "converted" : "would convert";
  if (filesChanged === 0) {
    return colors.green(`✓ Nothing to convert — ${filesScanned} files already TSDoc-clean.`);
  }
  // Relocated `@property` prose is called out rather than folded into the
  // comment count: it is the one change that moves text between declarations,
  // and a reader scanning the summary should see it happened.
  const moved =
    membersDocumented > 0
      ? ` ${String(membersDocumented)} @property description(s) moved onto interface members.`
      : "";
  return colors.bold(
    `${verb} ${commentsChanged} comment(s) across ${filesChanged}/${filesScanned} file(s).${moved}`,
  );
}
