/**
 * @packageDocumentation
 * `escalate` subcommand — the fourth and final migration step: bumps
 * `tsdoc-require-2/require` from the progressive `warn` to `error`.
 *
 * @remarks
 * A preflight ESLint run gates the change, because every message the rule emits
 * at `warn` becomes a CI failure at `error`. The patch itself is one line, so
 * the resulting commit is trivially reviewable — and is the only line that ever
 * conflicts when a migration branch is rebased.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { reportCommandFailure } from "@/commands/command-failure";
import { parseReportFormat, parseSeverity } from "@/commands/options";
import {
  PRESENCE_RULE_ID,
  runPreflight,
  updateRuleSeverity,
  type PreflightResult,
  type SeverityOccurrence,
} from "@/escalator";
import { detectProject, type Severity } from "@/generator";
import {
  createColors,
  formatFileDiff,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type Colors,
  type SummaryRow,
} from "@/reporter";
import { writeFileText } from "@/writer";

/**
 * What the command concluded.
 *
 * - `escalated` — the config was rewritten.
 * - `would-change` — a `--dry-run` / `--check` run that found pending work.
 * - `unchanged` — the config already carried the target severity.
 * - `blocked` — the preflight still reports undocumented exports.
 * - `failed` — the command could not run (no config, no rule, no ESLint).
 */
type EscalateStatus =
  | "escalated"
  | "would-change"
  | "unchanged"
  | "blocked"
  | "failed";

interface Outcome {
  readonly status: EscalateStatus;
  readonly severity: Severity;
  readonly configPath: string | undefined;
  readonly occurrences: readonly SeverityOccurrence[];
  readonly preflight: PreflightResult | undefined;
  readonly diff: string | undefined;
  readonly reason: string | undefined;
}

/** How many violations the human report lists before summarising the rest. */
const MAX_LISTED_VIOLATIONS = 10;

const EXIT_CODES: Readonly<Record<EscalateStatus, number>> = Object.freeze({
  escalated: 0,
  "would-change": 0,
  unchanged: 0,
  blocked: 3,
  failed: 1,
});

/**
 * The `escalate` command definition.
 */
export default defineCommand({
  meta: {
    name: "escalate",
    description:
      'Bump tsdoc-require-2/require from "warn" to "error" after a preflight check.',
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to escalate.",
      default: ".",
    },
    "dry-run": {
      type: "boolean",
      description: "Show the config diff without writing.",
      alias: "d",
    },
    preview: {
      type: "boolean",
      description: "Alias for --dry-run.",
    },
    check: {
      type: "boolean",
      description:
        "CI mode — exit 3 if the rule is not at the target severity yet; never writes, never lints.",
    },
    severity: {
      type: "string",
      description: "Target severity: error (default) | warn.",
      default: "error",
    },
    "skip-preflight": {
      type: "boolean",
      description: "Escalate without running ESLint first.",
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
      const colors = createColors(
        reportFormat === undefined && shouldUseColor(Boolean(process.stdout.isTTY)),
      );
      const severity = parseSeverity(args.severity);

      const outcome =
        severity === undefined
          ? failure(
              "error",
              `Unknown --severity ${JSON.stringify(args.severity)} — expected "warn" or "error".`,
            )
          : await escalate({
              cwd,
              severity,
              check,
              dryRun,
              skipPreflight: Boolean(args["skip-preflight"]),
              withDiff: reportFormat === undefined,
              colors,
            });

      emit(outcome, cwd, reportFormat, colors);
      const exitCode =
        check && outcome.status === "would-change" ? 3 : EXIT_CODES[outcome.status];
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    } catch (error) {
      reportCommandFailure("escalate", error);
    }
  },
});

interface EscalateInput {
  readonly cwd: string;
  readonly severity: Severity;
  readonly check: boolean;
  readonly dryRun: boolean;
  readonly skipPreflight: boolean;
  readonly withDiff: boolean;
  readonly colors: Colors;
}

/**
 * Builds a `failed` outcome.
 *
 * @param severity - The requested target severity.
 * @param reason - Why the command could not proceed.
 * @param configPath - The config that was being patched, when one was found.
 * @returns The outcome to report.
 */
function failure(
  severity: Severity,
  reason: string,
  configPath?: string,
): Outcome {
  return {
    status: "failed",
    severity,
    configPath,
    occurrences: [],
    preflight: undefined,
    diff: undefined,
    reason,
  };
}

/**
 * Runs the escalation: locate the config, patch the severity, gate on a
 * preflight lint, and write unless the run is a preview.
 *
 * @param input - The resolved command options.
 * @returns The {@link Outcome} to report.
 */
async function escalate(input: EscalateInput): Promise<Outcome> {
  const layout = await detectProject(input.cwd);
  if (layout.eslintConfigPath === undefined) {
    return failure(
      input.severity,
      "No ESLint flat config found — run `jsdoc-to-tsdoc init` first.",
    );
  }

  const configPath = layout.eslintConfigPath;
  const before = await readFile(configPath, "utf8");
  const update = updateRuleSeverity(before, { severity: input.severity });
  if (!update.ok) {
    return failure(input.severity, update.reason, configPath);
  }

  const base = {
    severity: input.severity,
    configPath,
    occurrences: update.occurrences,
    reason: undefined,
  } as const;

  if (!update.changed) {
    return {
      ...base,
      status: "unchanged",
      preflight: undefined,
      diff: undefined,
    };
  }

  // `--check` answers "is this repo locked in yet?". Linting the whole project
  // to answer a question about one config line would make the CI gate far more
  // expensive than the signal is worth.
  if (input.check) {
    return {
      ...base,
      status: "would-change",
      preflight: undefined,
      diff: undefined,
    };
  }

  // The preflight runs for `warn` targets too, not just `error`: plenty of
  // pipelines lint with `--max-warnings 0`, where turning a rule from `off` to
  // `warn` breaks the build exactly as an `error` would.
  const preflight = input.skipPreflight
    ? undefined
    : await runPreflight({ cwd: input.cwd });

  if (preflight?.status === "violations") {
    return { ...base, status: "blocked", preflight, diff: undefined };
  }
  if (preflight?.status === "unavailable") {
    return {
      ...failure(input.severity, preflight.reason, configPath),
      occurrences: update.occurrences,
      preflight,
    };
  }

  const diff = input.withDiff
    ? formatFileDiff(
        relative(input.cwd, configPath),
        before,
        update.content,
        input.colors,
      )
    : undefined;

  if (input.dryRun) {
    return { ...base, status: "would-change", preflight, diff };
  }

  await writeFileText(configPath, update.content);
  return { ...base, status: "escalated", preflight, diff: undefined };
}

/**
 * Writes the outcome in the requested format.
 *
 * @param outcome - What the command concluded.
 * @param cwd - The project root, used to relativize paths.
 * @param format - The `--report` format, or `undefined` for human output.
 * @param colors - Style functions for the terminal.
 */
function emit(
  outcome: Outcome,
  cwd: string,
  format: "json" | "md" | undefined,
  colors: Colors,
): void {
  if (format === "json") {
    process.stdout.write(`${renderJson(outcome, cwd)}\n`);
    return;
  }
  if (format === "md") {
    process.stdout.write(`${renderMarkdown(outcome, cwd)}\n`);
    return;
  }
  renderHuman(outcome, cwd, colors);
}

/**
 * Summarises a preflight result for machine-readable output.
 *
 * @param preflight - The preflight result, when it ran.
 * @param cwd - The project root, used to relativize paths.
 * @returns A JSON-ready object, or `null` when the preflight was skipped.
 */
function preflightPayload(
  preflight: PreflightResult | undefined,
  cwd: string,
): Record<string, unknown> | null {
  if (preflight === undefined) {
    return null;
  }
  if (preflight.status === "unavailable") {
    return { status: preflight.status, reason: preflight.reason };
  }
  const violations =
    preflight.status === "violations"
      ? preflight.violations.map((violation) => ({
          path: relative(cwd, violation.filePath),
          line: violation.line,
          column: violation.column,
          message: violation.message,
        }))
      : [];
  return {
    status: preflight.status,
    filesChecked: preflight.filesChecked,
    violations,
  };
}

/**
 * Renders the outcome as JSON.
 *
 * @param outcome - What the command concluded.
 * @param cwd - The project root, used to relativize paths.
 * @returns The JSON report.
 */
function renderJson(outcome: Outcome, cwd: string): string {
  return toJsonReport({
    command: "escalate",
    status: outcome.status,
    rule: PRESENCE_RULE_ID,
    severity: outcome.severity,
    wrote: outcome.status === "escalated",
    configPath:
      outcome.configPath === undefined ? null : relative(cwd, outcome.configPath),
    occurrences: outcome.occurrences,
    preflight: preflightPayload(outcome.preflight, cwd),
    reason: outcome.reason ?? null,
  });
}

/**
 * Renders the outcome as a Markdown table.
 *
 * @param outcome - What the command concluded.
 * @param cwd - The project root, used to relativize paths.
 * @returns The Markdown report.
 */
function renderMarkdown(outcome: Outcome, cwd: string): string {
  const rows: SummaryRow[] = [
    { label: "Status", value: outcome.status },
    { label: "Rule", value: PRESENCE_RULE_ID },
    { label: "Target severity", value: outcome.severity },
    {
      label: "Config",
      value:
        outcome.configPath === undefined ? "—" : relative(cwd, outcome.configPath),
    },
    { label: "Assignments updated", value: outcome.occurrences.length },
  ];
  if (outcome.preflight !== undefined) {
    rows.push({ label: "Preflight", value: outcome.preflight.status });
  }
  if (outcome.reason !== undefined) {
    rows.push({ label: "Reason", value: outcome.reason });
  }
  return toMarkdownTable("Field", rows, "Value");
}

/**
 * Renders the human-oriented report: the diff or write confirmation, the
 * preflight verdict, and the next step.
 *
 * @param outcome - What the command concluded.
 * @param cwd - The project root, used to relativize paths.
 * @param colors - Style functions for the terminal.
 */
function renderHuman(outcome: Outcome, cwd: string, colors: Colors): void {
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const config =
    outcome.configPath === undefined ? "" : relative(cwd, outcome.configPath);

  if (outcome.preflight?.status === "clean") {
    out(
      colors.green(
        `✓ Preflight: ${PRESENCE_RULE_ID} reports nothing across ${String(outcome.preflight.filesChecked)} file(s).`,
      ),
    );
  }

  switch (outcome.status) {
    case "failed":
      process.stderr.write(
        `${colors.yellow(`✗ ${outcome.reason ?? "escalation failed"}`)}\n`,
      );
      if (outcome.preflight?.status === "unavailable") {
        process.stderr.write(
          `${colors.dim("Re-run with --skip-preflight to escalate without linting.")}\n`,
        );
      }
      return;

    case "blocked": {
      renderViolations(outcome, cwd, colors);
      return;
    }

    case "unchanged":
      out(
        colors.green(
          `✓ ${config} already sets ${PRESENCE_RULE_ID} to "${outcome.severity}".`,
        ),
      );
      return;

    case "would-change":
      if (outcome.diff !== undefined) {
        out(outcome.diff);
      }
      out(
        colors.dim(
          `Preview only — re-run without --dry-run/--check to set ${PRESENCE_RULE_ID} to "${outcome.severity}".`,
        ),
      );
      return;

    case "escalated":
      for (const occurrence of outcome.occurrences) {
        out(
          colors.green(
            `✓ ${config}:${String(occurrence.line)} — ${PRESENCE_RULE_ID}: "${occurrence.from}" → "${outcome.severity}"`,
          ),
        );
      }
      out(
        colors.bold(
          `Next: commit the lock-in —\n  git commit -am "chore: escalate tsdoc-require to ${outcome.severity}"`,
        ),
      );
      return;
  }
}

/**
 * Prints the violations that block an escalation.
 *
 * @param outcome - The blocked outcome.
 * @param cwd - The project root, used to relativize paths.
 * @param colors - Style functions for the terminal.
 */
function renderViolations(outcome: Outcome, cwd: string, colors: Colors): void {
  if (outcome.preflight?.status !== "violations") {
    return;
  }
  const { violations } = outcome.preflight;
  process.stderr.write(
    `${colors.yellow(`✗ ${String(violations.length)} export(s) still reported by ${PRESENCE_RULE_ID}:`)}\n`,
  );
  for (const violation of violations.slice(0, MAX_LISTED_VIOLATIONS)) {
    const location = `${relative(cwd, violation.filePath)}:${String(violation.line)}:${String(violation.column)}`;
    process.stderr.write(`  ${location}  ${violation.message}\n`);
  }
  if (violations.length > MAX_LISTED_VIOLATIONS) {
    process.stderr.write(
      `${colors.dim(`  … and ${String(violations.length - MAX_LISTED_VIOLATIONS)} more.`)}\n`,
    );
  }
  process.stderr.write(
    `${colors.dim("Run `jsdoc-to-tsdoc scaffold` to document them, or --skip-preflight to escalate anyway.")}\n`,
  );
}
