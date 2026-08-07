/**
 * Shared parsing of command-line option values.
 *
 * @since 0.1.0
 */

import type { Severity } from "@/generator";
import type { ReportFormat } from "@/reporter";

/**
 * Splits a comma-separated glob option into a trimmed, non-empty list.
 *
 * @param value - The raw option value (for example `"src/lib/**,src/actions/**"`).
 * @returns The individual glob patterns, or an empty array when unset.
 */
export function splitGlobs(value: unknown): string[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((glob) => glob.trim())
    .filter((glob) => glob.length > 0);
}

/**
 * Parses the `--report` option into a known {@link ReportFormat}.
 *
 * @param value - The raw option value.
 * @returns The format, or `undefined` for human-oriented default output (which
 * is what any unrecognized value, including `table`, falls back to).
 */
export function parseReportFormat(value: unknown): ReportFormat | undefined {
  if (value === "json" || value === "md") {
    return value;
  }
  return undefined;
}

/**
 * Checks whether `--interactive` is usable given the other flags and the
 * environment.
 *
 * @remarks
 * Interactive review writes files one prompt at a time, so it is meaningless
 * alongside the flags that never write (`--dry-run`/`--preview`, `--check`,
 * `--report`) and impossible without a terminal to prompt on. Returning the
 * reason as a string keeps the command layer's job to a single throw.
 *
 * @param context - Whether interactive was requested, which non-writing flags
 * are set, and whether stdout is a TTY.
 * @returns A message explaining why interactive cannot run, or `undefined` when
 * it can (including when it was not requested at all).
 */
export function interactiveConflict(context: {
  readonly interactive: boolean;
  readonly dryRun: boolean;
  readonly check: boolean;
  readonly report: boolean;
  readonly isTTY: boolean;
}): string | undefined {
  if (!context.interactive) {
    return undefined;
  }
  const blockers: string[] = [];
  if (context.dryRun) {
    blockers.push("--dry-run/--preview");
  }
  if (context.check) {
    blockers.push("--check");
  }
  if (context.report) {
    blockers.push("--report");
  }
  if (blockers.length > 0) {
    return `--interactive cannot be combined with ${blockers.join(", ")}.`;
  }
  if (!context.isTTY) {
    return "--interactive needs an interactive terminal, but stdout is not a TTY.";
  }
  return undefined;
}

/**
 * Parses the `--severity` option into a rule severity.
 *
 * @param value - The raw option value.
 * @returns The severity, or `undefined` for anything unrecognized — which the
 * caller reports rather than silently coercing, since guessing the severity of
 * an enforcement change would be the wrong kind of helpful.
 */
export function parseSeverity(value: unknown): Severity | undefined {
  if (value === "warn" || value === "error") {
    return value;
  }
  return undefined;
}
