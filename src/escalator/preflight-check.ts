/**
 * The lint check that runs before the presence rule is escalated.
 *
 * @remarks
 * Escalation is only safe when the rule currently reports nothing: every
 * message it emits at `warn` becomes a CI failure at `error`. So the preflight
 * runs the project's **own** ESLint with its **own** config and counts the
 * messages `tsdoc-require-2/require` produces, whatever severity they carry.
 *
 * Reading the project's real config — rather than forcing the rule on through
 * an override — is what makes the answer trustworthy: every `off` the author
 * configured (the test-file override `init` writes, most commonly) is honoured
 * exactly as CI will honour it, so the check cannot manufacture violations that
 * the real pipeline would never report.
 *
 * ESLint is resolved from the target project, never from this CLI's own
 * dependencies, so the version that gates the escalation is the version the
 * project actually runs.
 *
 * @since 0.1.0
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PRESENCE_RULE_ID } from "@/escalator/rule-updater";

/** Options for {@link runPreflight}. */
export interface PreflightOptions {
  /** Absolute project directory to lint. */
  readonly cwd: string;
  /** Lint patterns, relative to `cwd`. Defaults to the whole project. */
  readonly patterns?: readonly string[];
}

/** One place the presence rule still reports a missing TSDoc comment. */
export interface PreflightViolation {
  /** Absolute path of the offending file. */
  readonly filePath: string;
  /** 1-based line of the undocumented declaration. */
  readonly line: number;
  /** 1-based column of the undocumented declaration. */
  readonly column: number;
  /** The rule's own message. */
  readonly message: string;
}

/**
 * The outcome of a preflight run: clean, blocked by violations, or not runnable
 * at all (which is reported rather than thrown, so the command can offer
 * `--skip-preflight` instead of failing opaquely).
 */
export type PreflightResult =
  | { readonly status: "clean"; readonly filesChecked: number }
  | {
      readonly status: "violations";
      readonly filesChecked: number;
      readonly violations: readonly PreflightViolation[];
    }
  | { readonly status: "unavailable"; readonly reason: string };

/** The subset of an ESLint lint message this check reads. */
interface LintMessage {
  readonly ruleId: string | null;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** The subset of an ESLint per-file result this check reads. */
interface LintResult {
  readonly filePath: string;
  readonly messages: readonly LintMessage[];
}

/** The subset of the `ESLint` class this check uses. */
interface LintEngine {
  lintFiles(patterns: readonly string[]): Promise<readonly LintResult[]>;
}

type LintEngineConstructor = new (options: {
  readonly cwd: string;
  readonly errorOnUnmatchedPattern: boolean;
}) => LintEngine;

const DEFAULT_PATTERNS: readonly string[] = Object.freeze(["."]);

/**
 * Extracts a message from an unknown thrown value.
 *
 * @param error - Whatever was thrown.
 * @returns The error's message, or its string form.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the `ESLint` class off a dynamically imported module namespace.
 *
 * @remarks
 * The module is loaded from the target project, so its shape is unknown at
 * compile time: ESLint has shipped as CommonJS (reached through `default` when
 * imported as ESM) and as a native ESM namespace. Both are accepted, and a
 * namespace carrying neither yields `undefined` rather than a crash.
 *
 * @param namespace - The imported module namespace.
 * @returns The constructor, or `undefined` when the module does not expose one.
 */
function readEslintClass(
  namespace: unknown,
): LintEngineConstructor | undefined {
  const candidates: unknown[] = [];
  if (typeof namespace === "object" && namespace !== null) {
    const record = namespace as Record<string, unknown>;
    candidates.push(record["ESLint"]);
    const fallback = record["default"];
    if (typeof fallback === "object" && fallback !== null) {
      candidates.push((fallback as Record<string, unknown>)["ESLint"]);
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      // The structural shape cannot be proven across a dynamic import; the call
      // site guards the usage with try/catch and reports `unavailable`.
      return candidate as LintEngineConstructor;
    }
  }
  return undefined;
}

/**
 * Resolves and imports ESLint from the target project.
 *
 * @param cwd - The absolute project directory.
 * @returns The project's `ESLint` class, or `undefined` when it is missing.
 */
async function loadEslintClass(
  cwd: string,
): Promise<LintEngineConstructor | undefined> {
  // Resolving against the project's own `package.json` anchors the lookup in the
  // target project rather than in this CLI's install location.
  const requireFromProject = createRequire(join(cwd, "package.json"));
  const entry = requireFromProject.resolve("eslint");
  const namespace: unknown = await import(pathToFileURL(entry).href);
  return readEslintClass(namespace);
}

/**
 * Collects the presence-rule messages out of raw ESLint results.
 *
 * @param results - The per-file lint results.
 * @returns One {@link PreflightViolation} per presence-rule message, in the
 * order ESLint reported them.
 */
export function collectRuleViolations(
  results: readonly LintResult[],
): readonly PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId === PRESENCE_RULE_ID) {
        violations.push({
          filePath: result.filePath,
          line: message.line,
          column: message.column,
          message: message.message,
        });
      }
    }
  }
  return violations;
}

/**
 * Runs the project's ESLint and reports whether the presence rule is silent.
 *
 * @param options - The project directory and optional lint patterns.
 * @returns A {@link PreflightResult}. `unavailable` means the check could not
 * run (ESLint missing, or its config failed to load) — not that the project is
 * clean.
 */
export async function runPreflight(
  options: PreflightOptions,
): Promise<PreflightResult> {
  let EslintClass: LintEngineConstructor | undefined;
  try {
    EslintClass = await loadEslintClass(options.cwd);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `ESLint could not be loaded from this project: ${messageOf(error)}`,
    };
  }

  if (EslintClass === undefined) {
    return {
      status: "unavailable",
      reason: "The resolved `eslint` module does not export an `ESLint` class.",
    };
  }

  try {
    const engine = new EslintClass({
      cwd: options.cwd,
      // A pattern that matches nothing (an empty package, or globs that are all
      // ignored) is an empty result set, not a failure.
      errorOnUnmatchedPattern: false,
    });
    const results = await engine.lintFiles([
      ...(options.patterns ?? DEFAULT_PATTERNS),
    ]);
    const violations = collectRuleViolations(results);

    return violations.length === 0
      ? { status: "clean", filesChecked: results.length }
      : { status: "violations", filesChecked: results.length, violations };
  } catch (error) {
    return {
      status: "unavailable",
      reason: `ESLint failed to run: ${messageOf(error)}`,
    };
  }
}
