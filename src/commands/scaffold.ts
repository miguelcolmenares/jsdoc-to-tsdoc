/**
 * @packageDocumentation
 * `scaffold` subcommand — generates TSDoc stubs for exports that have none.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { parseReportFormat, splitGlobs } from "@/commands/options";
import { scaffoldSourceText } from "@/commands/scaffold-file";
import {
  createColors,
  formatFileDiff,
  formatTable,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type SummaryRow,
} from "@/reporter";
import { TODO_MARKER } from "@/scaffolder";
import { findSourceFiles, type ExportKind } from "@/scanner";
import { writeFileText } from "@/writer";

interface ScaffoldedFile {
  readonly path: string;
  readonly stubsAdded: number;
}

const KIND_LABELS: Readonly<Record<ExportKind, string>> = Object.freeze({
  "react-component": "React components",
  "server-action": "Server Actions",
  hook: "Hooks",
  interface: "Interfaces",
  "type-alias": "Type aliases",
  function: "Functions",
  variable: "Constants",
  class: "Classes",
  enum: "Enums",
});

/**
 * The `scaffold` command definition.
 */
export default defineCommand({
  meta: {
    name: "scaffold",
    description: "Generate TSDoc stubs for exports that have no documentation.",
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to scan.",
      default: ".",
    },
    "dry-run": {
      type: "boolean",
      description: "Show a unified diff without writing files.",
      alias: "d",
    },
    preview: {
      type: "boolean",
      description: "Alias for --dry-run.",
    },
    check: {
      type: "boolean",
      description: "CI mode — exit 3 if any export lacks TSDoc; never writes.",
    },
    only: {
      type: "string",
      description: 'Comma-separated globs to include (e.g. "src/actions/**").',
    },
    exclude: {
      type: "string",
      description: 'Comma-separated globs to exclude (e.g. "**/*.test.ts").',
    },
    report: {
      type: "string",
      description: "Machine-readable output: json | md.",
    },
  },
  async run({ args }) {
    try {
      const cwd = resolve(String(args.cwd ?? "."));
      const check = Boolean(args.check);
      const dryRun = Boolean(args["dry-run"]) || Boolean(args.preview);
      const reportFormat = parseReportFormat(args.report);
      const willWrite = !dryRun && !check;

      const useColor =
        reportFormat === undefined &&
        shouldUseColor(Boolean(process.stdout.isTTY));
      const colors = createColors(useColor);

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: splitGlobs(args.exclude),
      });

      const scaffoldedFiles: ScaffoldedFile[] = [];
      const diffs: string[] = [];
      const totalsByKind: Partial<Record<ExportKind, number>> = {};
      let stubsAdded = 0;
      let exportsFound = 0;

      for (const file of files) {
        const before = await readFile(file, "utf8");
        const scaffold = scaffoldSourceText(before, file);
        exportsFound += scaffold.exportsFound;

        if (!scaffold.changed) {
          continue;
        }

        const relativePath = relative(cwd, file);
        scaffoldedFiles.push({
          path: relativePath,
          stubsAdded: scaffold.stubsAdded,
        });
        stubsAdded += scaffold.stubsAdded;
        for (const [kind, count] of Object.entries(scaffold.counts)) {
          const key = kind as ExportKind;
          totalsByKind[key] = (totalsByKind[key] ?? 0) + (count ?? 0);
        }

        if (willWrite) {
          await writeFileText(file, scaffold.output);
        } else if (reportFormat === undefined) {
          diffs.push(
            formatFileDiff(relativePath, before, scaffold.output, colors),
          );
        }
      }

      if (reportFormat === "json") {
        process.stdout.write(
          `${toJsonReport({
            command: "scaffold",
            filesScanned: files.length,
            filesChanged: scaffoldedFiles.length,
            exportsFound,
            stubsAdded,
            byKind: totalsByKind,
            wrote: willWrite,
            files: scaffoldedFiles,
          })}\n`,
        );
      } else if (reportFormat === "md") {
        // Both machine-readable modes report the same facts: the JSON `byKind`
        // field and this breakdown must stay in step.
        const fileRows: SummaryRow[] = scaffoldedFiles.map((file) => ({
          label: file.path,
          value: file.stubsAdded,
        }));
        const kindRows: SummaryRow[] = Object.entries(KIND_LABELS)
          .map(([kind, label]) => ({
            label,
            value: totalsByKind[kind as ExportKind] ?? 0,
          }))
          .filter((row) => row.value > 0);

        process.stdout.write(
          `${toMarkdownTable("File", fileRows, "Stubs added")}\n\n${toMarkdownTable(
            "Export kind",
            kindRows,
            "Stubs added",
          )}\n`,
        );
      } else {
        for (const diff of diffs) {
          process.stdout.write(`${diff}\n`);
        }

        const rows: SummaryRow[] = [
          { label: "Files scanned", value: files.length },
          { label: "Exports found", value: exportsFound },
          { label: "Exports undocumented", value: stubsAdded },
        ];
        for (const [kind, label] of Object.entries(KIND_LABELS)) {
          const count = totalsByKind[kind as ExportKind];
          if (count !== undefined && count > 0) {
            rows.push({ label: `  ${label}`, value: count });
          }
        }
        process.stdout.write(`${formatTable(rows, colors)}\n`);

        if (stubsAdded === 0) {
          process.stdout.write(
            `${colors.green("✓ Every export already has TSDoc.")}\n`,
          );
        } else if (willWrite) {
          process.stdout.write(
            `${colors.bold(`Added ${String(stubsAdded)} stub(s) across ${String(scaffoldedFiles.length)} file(s).`)}\n`,
          );
          process.stdout.write(
            `${colors.dim(`Review the generated prose: grep -rn "${TODO_MARKER}" .`)}\n`,
          );
        } else {
          process.stdout.write(
            `${colors.dim("Preview only — re-run without --dry-run/--check to apply.")}\n`,
          );
        }
      }

      if (check && stubsAdded > 0) {
        process.exitCode = 3;
      }
    } catch (error) {
      process.stderr.write(
        `jsdoc-to-tsdoc: scaffold failed — ${(error as Error).message}\n`,
      );
      process.exitCode = 1;
    }
  },
});
