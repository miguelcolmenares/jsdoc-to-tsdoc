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
import { parseReportFormat, splitGlobs } from "@/commands/options";
import {
  createColors,
  formatConvertSummary,
  formatFileDiff,
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
    only: {
      type: "string",
      description: "Comma-separated globs to include (e.g. \"src/lib/**\").",
    },
    exclude: {
      type: "string",
      description: "Comma-separated globs to exclude (e.g. \"**/*.test.ts\").",
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
      const willWrite = !dryRun && !check;

      const useColor =
        reportFormat === undefined &&
        shouldUseColor(Boolean(process.stdout.isTTY));
      const colors = createColors(useColor);

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: splitGlobs(args.exclude),
      });

      const changedFiles: ChangedFile[] = [];
      const diffs: string[] = [];
      let commentsChanged = 0;
      let membersDocumented = 0;
      let commentsPromoted = 0;

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
        changedFiles.push({
          path: relativePath,
          commentsChanged: conversion.commentsChanged,
          membersDocumented: conversion.membersDocumented,
          commentsPromoted: conversion.commentsPromoted,
          appliedRules: conversion.appliedRules,
        });
        commentsChanged += conversion.commentsChanged;
        membersDocumented += conversion.membersDocumented;
        commentsPromoted += conversion.commentsPromoted;

        if (willWrite) {
          await writeFileText(file, conversion.output);
        } else if (reportFormat === undefined) {
          diffs.push(formatFileDiff(relativePath, before, conversion.output, colors));
        }
      }

      if (reportFormat === "json") {
        process.stdout.write(
          `${toJsonReport({
            command: "convert",
            filesScanned: files.length,
            filesChanged: changedFiles.length,
            commentsChanged,
            membersDocumented,
            commentsPromoted,
            wrote: willWrite,
            files: changedFiles,
          })}\n`,
        );
      } else if (reportFormat === "md") {
        const rows: SummaryRow[] = changedFiles.map((file) => ({
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
              filesChanged: changedFiles.length,
              commentsChanged,
              membersDocumented,
              commentsPromoted,
              wrote: willWrite,
            },
            colors,
          )}\n`,
        );
        if (!willWrite && changedFiles.length > 0) {
          process.stdout.write(
            `${colors.dim("Preview only — re-run without --dry-run/--check to apply.")}\n`,
          );
        }
      }

      if (check && changedFiles.length > 0) {
        process.exitCode = 3;
      }
    } catch (error) {
      reportCommandFailure("convert", error);
    }
  },
});
