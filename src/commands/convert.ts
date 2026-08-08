/**
 * @packageDocumentation
 * `convert` subcommand — transforms existing JSDoc comments into TSDoc syntax.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { convertSourceText } from "@/commands/convert-file";
import { reportCommandFailure } from "@/commands/command-failure";
import {
  interactiveConflict,
  parseReportFormat,
  splitGlobs,
} from "@/commands/options";
import {
  editInEditor,
  promptFileAction,
  runInteractive,
  type FileChange,
} from "@/prompter";
import {
  createColors,
  formatConvertSummary,
  formatFileDiff,
  formatInteractiveSummary,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type SummaryRow,
} from "@/reporter";
import { findSourceFiles } from "@/scanner";
import { writeFileText } from "@/writer";

interface ChangedFile {
  readonly path: string;
  readonly commentsChanged: number;
  readonly membersDocumented: number;
  readonly commentsPromoted: number;
  readonly appliedRules: readonly string[];
}

/** Sums the per-file counts of a set of changed files. */
function totals(files: readonly ChangedFile[]): {
  commentsChanged: number;
  membersDocumented: number;
  commentsPromoted: number;
} {
  return files.reduce(
    (accumulator, file) => ({
      commentsChanged: accumulator.commentsChanged + file.commentsChanged,
      membersDocumented: accumulator.membersDocumented + file.membersDocumented,
      commentsPromoted: accumulator.commentsPromoted + file.commentsPromoted,
    }),
    { commentsChanged: 0, membersDocumented: 0, commentsPromoted: 0 },
  );
}

/**
 * The `convert` command definition.
 */
export default defineCommand({
  meta: {
    name: "convert",
    description: "Transform existing JSDoc comments into TSDoc syntax.",
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
    lite: {
      type: "boolean",
      description: "Only fix @param/@returns hygiene; leave prose untouched.",
    },
    "promote-line-comments": {
      type: "boolean",
      description: "Rewrite // prose above undocumented exports as /** */.",
    },
    check: {
      type: "boolean",
      description: "CI mode — exit 3 if any file would change; never writes.",
    },
    interactive: {
      type: "boolean",
      description: "Review each changed file and accept/skip/edit/quit.",
      alias: "i",
    },
    only: {
      type: "string",
      description: 'Comma-separated globs to include (e.g. "src/lib/**").',
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
      const lite = Boolean(args.lite);
      const promoteLineComments = Boolean(args["promote-line-comments"]);
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

      // Records carry the per-file counts for the summary and reports — small
      // and always kept. The full converted output is retained only when the
      // interactive flow must defer the write; a straight write-through streams
      // one file at a time. Diffs are built only where they are shown.
      //
      // Interactive deliberately scans every file before the first prompt rather
      // than interleaving the prompt with the scan: it keeps `runInteractive` a
      // pure orchestrator (prompt/edit/write injected, no file iteration), which
      // is what makes accept/skip/edit/quit testable without a TTY. A run over a
      // whole repo is scoped with `--only`, so the up-front pass is bounded.
      const records: ChangedFile[] = [];
      const changes: FileChange[] = [];
      const diffs: string[] = [];

      for (const file of files) {
        const before = await readFile(file, "utf8");
        const conversion = convertSourceText(before, file, {
          lite,
          promoteLineComments,
        });
        if (!conversion.changed) {
          continue;
        }

        const relativePath = relative(cwd, file);
        records.push({
          path: relativePath,
          commentsChanged: conversion.commentsChanged,
          membersDocumented: conversion.membersDocumented,
          commentsPromoted: conversion.commentsPromoted,
          appliedRules: conversion.appliedRules,
        });

        if (interactive) {
          changes.push({
            path: relativePath,
            absolutePath: file,
            proposed: conversion.output,
            diff: formatFileDiff(
              relativePath,
              before,
              conversion.output,
              colors,
            ),
          });
        } else if (willWrite) {
          await writeFileText(file, conversion.output);
        } else if (reportFormat === undefined) {
          diffs.push(
            formatFileDiff(relativePath, before, conversion.output, colors),
          );
        }
      }

      if (interactive) {
        const result = await runInteractive(changes, {
          prompt: promptFileAction,
          edit: (change) => editInEditor(change.path, change.proposed),
          write: (absolutePath, content) =>
            writeFileText(absolutePath, content),
        });

        const written = new Set(result.written);
        const applied = records.filter((record) => written.has(record.path));
        const sums = totals(applied);

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
        // Only detail the conversion when something was written. With nothing
        // accepted, `formatConvertSummary` would print "nothing to convert —
        // already TSDoc-clean", contradicting the files the user just skipped.
        //
        // The counts describe what `convert` proposed for the written files; a
        // hand `edit` in `$EDITOR` is the user's own change on top and is not
        // re-counted — the summary reports the conversion, not a post-edit audit.
        if (applied.length > 0) {
          process.stdout.write(
            `${formatConvertSummary(
              {
                filesScanned: files.length,
                filesChanged: applied.length,
                commentsChanged: sums.commentsChanged,
                membersDocumented: sums.membersDocumented,
                commentsPromoted: sums.commentsPromoted,
                wrote: true,
              },
              colors,
            )}\n`,
          );
        }
        return;
      }

      const sums = totals(records);

      if (reportFormat === "json") {
        process.stdout.write(
          `${toJsonReport({
            command: "convert",
            filesScanned: files.length,
            filesChanged: records.length,
            commentsChanged: sums.commentsChanged,
            membersDocumented: sums.membersDocumented,
            commentsPromoted: sums.commentsPromoted,
            wrote: willWrite,
            files: records,
          })}\n`,
        );
      } else if (reportFormat === "md") {
        const rows: SummaryRow[] = records.map((file) => ({
          label: file.path,
          value: file.commentsChanged,
        }));
        process.stdout.write(
          `${toMarkdownTable("File", rows, "Comments changed")}\n`,
        );
      } else {
        for (const diff of diffs) {
          process.stdout.write(`${diff}\n`);
        }
        process.stdout.write(
          `${formatConvertSummary(
            {
              filesScanned: files.length,
              filesChanged: records.length,
              commentsChanged: sums.commentsChanged,
              membersDocumented: sums.membersDocumented,
              commentsPromoted: sums.commentsPromoted,
              wrote: willWrite,
            },
            colors,
          )}\n`,
        );
        if (!willWrite && records.length > 0) {
          process.stdout.write(
            `${colors.dim("Preview only — re-run without --dry-run/--check to apply.")}\n`,
          );
        }
      }

      if (check && records.length > 0) {
        process.exitCode = 3;
      }
    } catch (error) {
      reportCommandFailure("convert", error);
    }
  },
});
