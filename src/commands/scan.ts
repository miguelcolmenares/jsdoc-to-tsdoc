/**
 * @packageDocumentation
 * `scan` subcommand — read-only inventory of what `convert` would change.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineCommand } from "citty";

import { convertSourceText } from "@/commands/convert-file";
import { parseReportFormat, splitGlobs } from "@/commands/options";
import {
  createColors,
  formatTable,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type SummaryRow,
} from "@/reporter";
import { extractJsDocComments, findSourceFiles } from "@/scanner";

interface ScanTotals {
  readonly filesScanned: number;
  readonly filesWithJsDoc: number;
  readonly commentsTotal: number;
  readonly commentsToConvert: number;
  readonly filesToChange: number;
}

/**
 * The `scan` command definition.
 */
export default defineCommand({
  meta: {
    name: "scan",
    description: "Inventory the JSDoc that convert would touch (no writes).",
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to scan.",
      default: ".",
    },
    lite: {
      type: "boolean",
      description: "Count only @param/@returns hygiene changes.",
    },
    only: {
      type: "string",
      description: "Comma-separated globs to include.",
    },
    exclude: {
      type: "string",
      description: "Comma-separated globs to exclude.",
    },
    report: {
      type: "string",
      description: "Machine-readable output: json | md.",
    },
  },
  async run({ args }) {
    try {
      const cwd = resolve(String(args.cwd ?? "."));
      const lite = Boolean(args.lite);
      const reportFormat = parseReportFormat(args.report);

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: splitGlobs(args.exclude),
      });

      let filesWithJsDoc = 0;
      let commentsTotal = 0;
      let commentsToConvert = 0;
      let filesToChange = 0;

      for (const file of files) {
        const source = await readFile(file, "utf8");
        const comments = extractJsDocComments(source, file);
        if (comments.length > 0) {
          filesWithJsDoc += 1;
        }
        commentsTotal += comments.length;

        const conversion = convertSourceText(source, file, { lite });
        commentsToConvert += conversion.commentsChanged;
        if (conversion.changed) {
          filesToChange += 1;
        }
      }

      const totals: ScanTotals = {
        filesScanned: files.length,
        filesWithJsDoc,
        commentsTotal,
        commentsToConvert,
        filesToChange,
      };

      const rows: SummaryRow[] = [
        { label: "Files scanned", value: totals.filesScanned },
        { label: "Files with JSDoc", value: totals.filesWithJsDoc },
        { label: "Comments total", value: totals.commentsTotal },
        { label: "Comments to convert", value: totals.commentsToConvert },
        { label: "Files to change", value: totals.filesToChange },
      ];

      if (reportFormat === "json") {
        process.stdout.write(`${toJsonReport({ command: "scan", ...totals })}\n`);
        return;
      }
      if (reportFormat === "md") {
        process.stdout.write(`${toMarkdownTable("Category", rows)}\n`);
        return;
      }

      const colors = createColors(shouldUseColor(Boolean(process.stdout.isTTY)));
      process.stdout.write(`${formatTable(rows, colors)}\n`);
      if (totals.filesToChange > 0) {
        process.stdout.write(
          `${colors.dim("Run `jsdoc-to-tsdoc convert --dry-run` to preview changes.")}\n`,
        );
      }
    } catch (error) {
      process.stderr.write(
        `jsdoc-to-tsdoc: scan failed — ${(error as Error).message}\n`,
      );
      process.exitCode = 1;
    }
  },
});
