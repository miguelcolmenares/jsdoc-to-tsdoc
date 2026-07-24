/**
 * @packageDocumentation
 * Public API of the reporter domain: colored diffs, summary tables, and
 * machine-readable JSON / Markdown report output.
 *
 * @since 0.1.0
 */

export { createColors, shouldUseColor, type Colors } from "@/reporter/colors";

export { formatFileDiff } from "@/reporter/dry-run-reporter";

export { toJsonReport, toMarkdownTable } from "@/reporter/json-reporter";

export {
  formatConvertSummary,
  formatTable,
  type ReportFormat,
  type SummaryRow,
} from "@/reporter/summary-reporter";
