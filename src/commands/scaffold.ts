/**
 * @packageDocumentation
 * `scaffold` subcommand — generates TSDoc stubs for exports that have none.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { reportCommandFailure } from "@/commands/command-failure";
import {
  interactiveConflict,
  parseReportFormat,
  splitGlobs,
} from "@/commands/options";
import { scaffoldSourceText } from "@/commands/scaffold-file";
import {
  editInEditor,
  promptFileAction,
  runInteractive,
  type FileChange,
} from "@/prompter";
import {
  createColors,
  formatFileDiff,
  formatInteractiveSummary,
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

/** Merges per-file per-kind stub counts into one total. */
function mergeCounts(
  perFile: readonly Partial<Record<ExportKind, number>>[],
): Partial<Record<ExportKind, number>> {
  const totals: Partial<Record<ExportKind, number>> = {};
  for (const counts of perFile) {
    for (const [kind, count] of Object.entries(counts)) {
      const key = kind as ExportKind;
      totals[key] = (totals[key] ?? 0) + (count ?? 0);
    }
  }
  return totals;
}

const KIND_LABELS: Readonly<Record<ExportKind, string>> = Object.freeze({
  "react-component": "React components",
  "server-action": "Server Actions",
  hook: "Hooks",
  interface: "Interfaces",
  "type-alias": "Type aliases",
  function: "Functions",
  variable: "Variables",
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
    interactive: {
      type: "boolean",
      description: "Review each scaffolded file and accept/skip/edit/quit.",
      alias: "i",
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
      const interactive = Boolean(args.interactive);
      const willWrite = !dryRun && !check;

      const conflict = interactiveConflict({
        interactive,
        dryRun,
        check,
        report: reportFormat !== undefined,
        isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
      if (conflict !== undefined) {
        throw new Error(conflict);
      }

      const useColor =
        reportFormat === undefined &&
        shouldUseColor(Boolean(process.stdout.isTTY));
      const colors = createColors(useColor);

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: splitGlobs(args.exclude),
      });

      // Records and per-file counts are small and always kept; the full stubbed
      // output is retained only when the interactive flow must defer the write.
      // A straight write-through streams one file at a time.
      //
      // As in `convert`, interactive scans every file before the first prompt so
      // that `runInteractive` stays a pure orchestrator (testable without a TTY);
      // a whole-repo run is bounded with `--only`.
      const scaffoldedFiles: ScaffoldedFile[] = [];
      const perFileCounts: Partial<Record<ExportKind, number>>[] = [];
      const changes: FileChange[] = [];
      const diffs: string[] = [];
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
        perFileCounts.push(scaffold.counts);

        if (interactive) {
          changes.push({
            path: relativePath,
            absolutePath: file,
            proposed: scaffold.output,
            diff: formatFileDiff(relativePath, before, scaffold.output, colors),
          });
        } else if (willWrite) {
          await writeFileText(file, scaffold.output);
        } else if (reportFormat === undefined) {
          diffs.push(
            formatFileDiff(relativePath, before, scaffold.output, colors),
          );
        }
      }

      if (interactive) {
        // Nothing to review: show the same clean message the non-interactive
        // run gives rather than a bare "0 written · 0 skipped" with no prompt.
        if (changes.length === 0) {
          process.stdout.write(
            `${colors.green("✓ Every export already has TSDoc.")}\n`,
          );
          return;
        }

        const result = await runInteractive(changes, {
          prompt: promptFileAction,
          edit: (change) => editInEditor(change.path, change.proposed),
          write: (absolutePath, content) =>
            writeFileText(absolutePath, content),
        });

        const written = new Set(result.written);
        const stubsWritten = scaffoldedFiles
          .filter((file) => written.has(file.path))
          .reduce((sum, file) => sum + file.stubsAdded, 0);

        process.stdout.write(
          `${formatInteractiveSummary(
            {
              written: result.written.length,
              skipped: result.skipped.length,
              remaining: result.remaining.length,
              quit: result.quit,
            },
            colors,
          )}\n`,
        );
        // The stub count describes what `scaffold` generated for the written
        // files; a hand `edit` in `$EDITOR` is the user's own change on top and
        // is not re-counted.
        if (stubsWritten > 0) {
          process.stdout.write(
            `${colors.bold(`Added ${String(stubsWritten)} stub(s) across ${String(result.written.length)} file(s).`)}\n`,
          );
          process.stdout.write(
            `${colors.dim(`Review the generated prose: grep -rn "${TODO_MARKER}" .`)}\n`,
          );
        }
        return;
      }

      const totalsByKind = mergeCounts(perFileCounts);
      const stubsAdded = scaffoldedFiles.reduce(
        (sum, file) => sum + file.stubsAdded,
        0,
      );

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
      reportCommandFailure("scaffold", error);
    }
  },
});
