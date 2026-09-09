/**
 * @packageDocumentation
 * `check` subcommand — the CI gate: validates every doc comment against the
 * official TSDoc parser, reports exports with no documentation, and flags
 * comments that still hold JSDoc syntax.
 *
 * @remarks
 * The other commands answer "would this change?"; `check` answers "is this
 * project actually migrated?" and never writes. It exits `3` when problems
 * remain and `2` when `tsdoc.json` could not be read — a config that fails to
 * load would silently turn every custom tag into a violation, so reporting
 * thousands of bogus problems is worse than stopping.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { checkSourceText, type ProblemKind } from "@/commands/check-file";
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
import { findSourceFiles } from "@/scanner";
import { createTsdocValidatorResolver, type TsdocValidator } from "@/validator";

interface FileReport {
  readonly path: string;
  readonly problems: readonly {
    readonly kind: ProblemKind;
    readonly line: number;
    readonly column: number;
    readonly message: string;
  }[];
}

const KIND_LABELS: Readonly<Record<ProblemKind, string>> = Object.freeze({
  syntax: "TSDoc syntax errors",
  missing: "Exports without TSDoc",
  legacy: "Files with legacy JSDoc",
});

/**
 * The `check` command definition.
 */
export default defineCommand({
  meta: {
    name: "check",
    description:
      "CI gate — validate TSDoc, report undocumented exports, exit 3 on problems.",
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to check.",
      default: ".",
    },
    "syntax-only": {
      type: "boolean",
      description:
        "Only validate comment syntax; ignore undocumented exports and legacy JSDoc.",
    },
    "include-tests": {
      type: "boolean",
      description:
        "Also check test files, which `init` exempts from the TSDoc rules.",
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
      const syntaxOnly = Boolean(args["syntax-only"]);
      const reportFormat = parseReportFormat(args.report);
      const colors = createColors(
        reportFormat === undefined &&
          shouldUseColor(Boolean(process.stdout.isTTY)),
      );

      // Monorepo support resolves `tsdoc.json` per file (nearest ancestor,
      // like ESLint's flat config or `tsconfig.json`), but the project root's
      // own config is still checked first and on its own, before any file is
      // discovered — the pre-flight sanity check this command has always run,
      // and the one a single-root project (no nested `tsdoc.json`) depends on
      // to exit `2` with nothing scanned when its only config is broken.
      const resolver = createTsdocValidatorResolver(cwd);
      const rootValidator = await resolver.forDirectory(cwd);
      if (rootValidator.configErrors.length > 0) {
        reportBrokenConfigs(
          [{ dir: cwd, validator: rootValidator }],
          cwd,
          colors,
        );
        process.exitCode = 2;
        return;
      }

      // Test files are excluded by default because the config `init` writes
      // turns both TSDoc rules off for them. A gate that reported what the
      // tool's own scaffolding excuses would be reporting phantom work.
      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: [
          ...splitGlobs(args.exclude),
          ...(args["include-tests"] ? [] : TEST_FILE_GLOBS),
        ],
      });

      // Resolve every file's validator before checking anything. A nested
      // `tsdoc.json` that fails to load is exactly as untrustworthy as a
      // broken root one, so the run refuses to mix trustworthy and
      // untrustworthy results in one summary rather than reporting partway
      // through and then aborting.
      const fileValidators = new Map<string, TsdocValidator>();
      for (const file of files) {
        fileValidators.set(file, await resolver.forFile(file));
      }
      const broken = resolver.brokenConfigs();
      if (broken.length > 0) {
        reportBrokenConfigs(broken, cwd, colors);
        process.exitCode = 2;
        return;
      }

      const reports: FileReport[] = [];
      const totals: Record<ProblemKind, number> = {
        syntax: 0,
        missing: 0,
        legacy: 0,
      };
      let problemCount = 0;
      const configPathsUsed = new Set<string>();

      for (const file of files) {
        // Present for every entry after the resolution pass above; the `?? `
        // fallback only satisfies `noUncheckedIndexedAccess` and is never the
        // config actually applied.
        const validator = fileValidators.get(file) ?? rootValidator;
        if (validator.configPath !== undefined) {
          configPathsUsed.add(validator.configPath);
        }
        const source = await readFile(file, "utf8");
        const result = checkSourceText(source, file, validator, { syntaxOnly });
        if (result.problems.length === 0) {
          continue;
        }
        reports.push({ path: relative(cwd, file), problems: result.problems });
        problemCount += result.problems.length;
        for (const [kind, count] of Object.entries(result.counts)) {
          totals[kind as ProblemKind] += count;
        }
      }

      emit(
        {
          cwd,
          files: files.length,
          reports,
          totals,
          problemCount,
          configPath: rootValidator.configPath,
          configPaths: [...configPathsUsed].sort(),
        },
        reportFormat,
        colors,
      );

      if (problemCount > 0) {
        process.exitCode = 3;
      }
    } catch (error) {
      reportCommandFailure("check", error);
    }
  },
});

/**
 * Prints every broken `tsdoc.json` this run encountered and why nothing was
 * checked.
 *
 * @remarks
 * For the single-root case — one entry, and its directory is the project
 * root — this reproduces the exact message `check` has always printed for a
 * config it found but could not apply, so a project with no nested
 * `tsdoc.json` sees byte-identical output. A nested config's message is
 * prefixed with its path relative to the root so a monorepo user knows which
 * package's config is the problem.
 *
 * @param broken - Every config that failed to load, paired with the
 * directory it was found in.
 * @param cwd - The project root, used to decide whether a directory is the
 * root itself and to relativize a nested one.
 * @param colors - Style functions for the terminal.
 */
function reportBrokenConfigs(
  broken: readonly {
    readonly dir: string;
    readonly validator: TsdocValidator;
  }[],
  cwd: string,
  colors: Colors,
): void {
  for (const { dir, validator } of broken) {
    // `join("", "tsdoc.json")` collapses to `"tsdoc.json"` when `dir` is
    // `cwd` itself, reproducing the exact single-root message; a nested
    // directory gets an OS-correct relative prefix instead of a hardcoded
    // separator.
    const label = join(relative(cwd, dir), "tsdoc.json");
    for (const error of validator.configErrors) {
      process.stderr.write(`${colors.yellow(`✗ ${label}: ${error}`)}\n`);
    }
  }
  process.stderr.write(
    `${colors.dim("Custom tags would be reported as undefined, so no file was checked.")}\n`,
  );
}

interface Summary {
  readonly cwd: string;
  readonly files: number;
  readonly reports: readonly FileReport[];
  readonly totals: Readonly<Record<ProblemKind, number>>;
  readonly problemCount: number;
  /** The project root's own `tsdoc.json`, unchanged from a single-config run. */
  readonly configPath: string | undefined;
  /**
   * Every distinct `tsdoc.json` actually applied while checking `files`, root
   * included when at least one file resolved to it. Empty on a project with
   * none at all. A single-root project always reports the same one path here
   * as in {@link Summary.configPath}.
   */
  readonly configPaths: readonly string[];
}

/**
 * Writes the run summary in the requested format.
 *
 * @param summary - The aggregated run result.
 * @param format - The `--report` format, or `undefined` for human output.
 * @param colors - Style functions for the terminal.
 */
function emit(
  summary: Summary,
  format: "json" | "md" | undefined,
  colors: Colors,
): void {
  if (format === "json") {
    process.stdout.write(
      `${toJsonReport({
        command: "check",
        filesScanned: summary.files,
        filesWithProblems: summary.reports.length,
        problems: summary.problemCount,
        byKind: summary.totals,
        tsdocConfig:
          summary.configPath === undefined
            ? null
            : relative(summary.cwd, summary.configPath),
        tsdocConfigs: summary.configPaths.map((path) =>
          relative(summary.cwd, path),
        ),
        files: summary.reports,
      })}\n`,
    );
    return;
  }

  if (format === "md") {
    const rows: SummaryRow[] = [
      { label: "Files scanned", value: summary.files },
      { label: "Files with problems", value: summary.reports.length },
      ...kindRows(summary.totals),
    ];
    process.stdout.write(`${toMarkdownTable("Category", rows)}\n`);
    return;
  }

  renderHuman(summary, colors);
}

/**
 * Builds the per-category rows shared by the table renderers.
 *
 * @param totals - Count per problem kind.
 * @returns One row per kind, including the zeroes so a clean run still shows
 * what was actually checked.
 */
function kindRows(totals: Readonly<Record<ProblemKind, number>>): SummaryRow[] {
  return Object.entries(KIND_LABELS).map(([kind, label]) => ({
    label,
    value: totals[kind as ProblemKind],
  }));
}

/**
 * Renders the human-oriented report: per-file problem lists, then a summary.
 *
 * @param summary - The aggregated run result.
 * @param colors - Style functions for the terminal.
 */
function renderHuman(summary: Summary, colors: Colors): void {
  for (const report of summary.reports) {
    process.stdout.write(`${colors.bold(report.path)}\n`);
    for (const problem of report.problems) {
      const location = `${String(problem.line)}:${String(problem.column)}`;
      process.stdout.write(
        `  ${colors.dim(location.padEnd(8))}${colors.yellow(problem.kind.padEnd(8))}${problem.message}\n`,
      );
    }
  }

  const rows: SummaryRow[] = [
    { label: "Files scanned", value: summary.files },
    { label: "Files with problems", value: summary.reports.length },
    ...kindRows(summary.totals),
  ];
  process.stdout.write(`${formatTable(rows, colors)}\n`);

  if (summary.problemCount === 0) {
    process.stdout.write(`${colors.green("✓ TSDoc is valid and complete.")}\n`);
    return;
  }
  process.stdout.write(
    `${colors.bold(`✗ ${String(summary.problemCount)} problem(s) across ${String(summary.reports.length)} file(s).`)}\n`,
  );
  if (summary.totals.missing > 0) {
    process.stdout.write(
      `${colors.dim("Run `jsdoc-to-tsdoc scaffold` to stub the missing documentation.")}\n`,
    );
  }
  if (summary.totals.legacy > 0) {
    process.stdout.write(
      `${colors.dim("Run `jsdoc-to-tsdoc convert` to finish the JSDoc migration.")}\n`,
    );
  }
}
