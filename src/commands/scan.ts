/**
 * @packageDocumentation
 * `scan` subcommand — read-only inventory of what `convert` would change.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { classifyFile } from "@/classifier";
import {
  actionLines,
  confidenceLine,
  missingCount,
  staleCount,
  staleFindings,
  summarizeClassification,
  topologyRows,
  type ClassifiedFile,
  type ClassifySummary,
} from "@/commands/classify-report";
import { convertSourceText } from "@/commands/convert-file";
import { reportCommandFailure } from "@/commands/command-failure";
import { parseReportFormat, splitGlobs } from "@/commands/options";
import { TEST_FILE_GLOBS } from "@/generator";
import {
  createColors,
  formatTable,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type Colors,
  type SummaryRow,
} from "@/reporter";
import {
  collectExportedDeclarations,
  extractJsDocComments,
  findSourceFiles,
} from "@/scanner";

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
    classify: {
      type: "boolean",
      description:
        "Report documentation topology and confidence instead of the conversion inventory.",
    },
    "fail-on-missing": {
      type: "boolean",
      description: "Exit 3 when any export has no TSDoc comment (implies --classify).",
    },
    "fail-on-stale": {
      type: "boolean",
      description:
        "Exit 3 when any comment contradicts its signature (implies --classify).",
    },
    "include-tests": {
      type: "boolean",
      description:
        "Classify test files too, which `init` exempts from the TSDoc rules.",
    },
  },
  async run({ args }) {
    try {
      const cwd = resolve(String(args.cwd ?? "."));
      const lite = Boolean(args.lite);
      const reportFormat = parseReportFormat(args.report);
      const failOnMissing = Boolean(args["fail-on-missing"]);
      const failOnStale = Boolean(args["fail-on-stale"]);
      // The gates read a classification, so asking for one implies producing it.
      const classify = Boolean(args.classify) || failOnMissing || failOnStale;

      // Classification judges how well exports are documented, and the ESLint
      // config `init` writes turns both TSDoc rules off for test paths — so
      // reporting them would be reporting work the tool's own scaffolding
      // excuses. The default inventory keeps them, because `convert` does
      // rewrite JSDoc in tests.
      const excludeTests =
        classify && !args["include-tests"] ? TEST_FILE_GLOBS : [];

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: [...splitGlobs(args.exclude), ...excludeTests],
      });

      if (classify) {
        await runClassify(
          { cwd, files, reportFormat, failOnMissing, failOnStale },
        );
        return;
      }

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
      reportCommandFailure("scan", error);
    }
  },
});

/** What a classification run needs to know. */
interface ClassifyRun {
  readonly cwd: string;
  readonly files: readonly string[];
  readonly reportFormat: "json" | "md" | undefined;
  readonly failOnMissing: boolean;
  readonly failOnStale: boolean;
}

/**
 * Classifies every file and emits the topology report.
 *
 * @param run - The run parameters.
 */
async function runClassify(run: ClassifyRun): Promise<void> {
  const classified: ClassifiedFile[] = [];

  for (const file of run.files) {
    const source = await readFile(file, "utf8");
    const classification = classifyFile(
      collectExportedDeclarations(source, file),
    );
    if (classification !== undefined) {
      classified.push({ path: relative(run.cwd, file), classification });
    }
  }

  const summary = summarizeClassification(classified, run.files.length);
  const colors = createColors(
    run.reportFormat === undefined &&
      shouldUseColor(Boolean(process.stdout.isTTY)),
  );

  emitClassification(summary, run.reportFormat, colors);

  const missing = missingCount(summary);
  const stale = staleCount(summary);
  if ((run.failOnMissing && missing > 0) || (run.failOnStale && stale > 0)) {
    process.exitCode = 3;
  }
}

/**
 * Writes the classification summary in the requested format.
 *
 * @param summary - The aggregated run result.
 * @param format - The `--report` format, or `undefined` for human output.
 * @param colors - Style functions for the terminal.
 */
function emitClassification(
  summary: ClassifySummary,
  format: "json" | "md" | undefined,
  colors: Colors,
): void {
  if (format === "json") {
    process.stdout.write(
      `${toJsonReport({
        command: "scan",
        mode: "classify",
        filesScanned: summary.filesScanned,
        filesWithoutExports: summary.filesWithoutExports,
        declarationsClassified: summary.declarationsClassified,
        byTopology: summary.byTopology,
        byConfidence: summary.byConfidence,
        files: summary.files.map(({ path, classification }) => ({
          path,
          topology: classification.topology,
          confidence: classification.confidence,
          declarations: classification.declarations,
        })),
      })}\n`,
    );
    return;
  }

  const rows: SummaryRow[] = topologyRows(summary).map(({ label, value }) => ({
    label,
    value,
  }));

  if (format === "md") {
    process.stdout.write(`${toMarkdownTable("Topology", rows, "Files")}\n`);
    return;
  }

  process.stdout.write(
    `${colors.bold(`Documentation analysis — ${String(summary.filesScanned)} file(s) scanned`)}\n`,
  );
  process.stdout.write(`${formatTable(rows, colors)}\n`);
  for (const line of actionLines(summary, colors)) {
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write(
    `${colors.dim(`Confidence: ${confidenceLine(summary)}`)}\n`,
  );

  const stale = staleFindings(summary);
  if (stale.length === 0) {
    return;
  }

  process.stdout.write(
    `\n${colors.bold("Stale documentation — review these by hand:")}\n`,
  );
  for (const { path, declaration } of stale) {
    process.stdout.write(
      `  ${colors.yellow(`${path}:${String(declaration.line)}`)} ${declaration.name}\n`,
    );
    for (const reason of declaration.stale) {
      process.stdout.write(`    ${colors.dim(reason)}\n`);
    }
  }
}
