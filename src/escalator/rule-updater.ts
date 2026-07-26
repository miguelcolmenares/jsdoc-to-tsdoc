/**
 * Severity patching of the TSDoc presence rule in an ESLint flat config.
 *
 * @remarks
 * The final step of a migration flips `tsdoc-require-2/require` from the
 * progressive `warn` to `error`, locking the codebase in. That is a one-line
 * change, so it is applied as text — the author's formatting, comments, and
 * config shape all survive untouched, and the resulting diff is the single line
 * that reviewers expect (and the only line that ever conflicts on a long-lived
 * migration branch).
 *
 * Two boundaries matter and are enforced here:
 *
 * - The rule name must end at `require`. Its siblings
 *   `tsdoc-require-2/require-param` and `tsdoc-require-2/require-returns` are
 *   deliberately `off` (they false-positive on interfaces, type aliases, and
 *   constants), and escalation must never touch them.
 * - An explicit `off` is a deliberate opt-out — typically the test-file override
 *   `init` writes — so escalation never switches it on.
 *
 * @since 0.1.0
 */

import { readConfigLines, type Severity } from "@/generator";

/** The presence rule the migration workflow escalates. */
export const PRESENCE_RULE_ID = "tsdoc-require-2/require";

/**
 * A severity a lint rule can carry in a config, including the disabled state
 * that {@link Severity} deliberately excludes.
 */
export type RuleSeverity = "off" | "warn" | "error";

/**
 * One `tsdoc-require-2/require` assignment the update rewrote.
 */
export interface SeverityOccurrence {
  /** 1-based line number of the assignment. */
  readonly line: number;
  /** The severity the rule carried before the update. */
  readonly from: RuleSeverity;
}

/**
 * The outcome of a severity update: the rewritten config, or a failure carrying
 * the reason the presence rule could not be located.
 */
export type RuleSeverityUpdate =
  | {
      readonly ok: true;
      /** The config source with every enabled assignment rewritten. */
      readonly content: string;
      /** `false` when the config already carried the target severity. */
      readonly changed: boolean;
      /** Every assignment that was rewritten, in source order. */
      readonly occurrences: readonly SeverityOccurrence[];
    }
  | { readonly ok: false; readonly reason: string };

// Captures the assignment prefix (group 1) and the current severity as either a
// quoted word (groups 2-3, quote and value) or a numeric literal (group 4). The
// closing quote right after `require` keeps this off the `-param` / `-returns`
// siblings; `(?![\w.])` after the digit keeps `1` from matching inside `10`.
const ASSIGNMENT =
  /(["']tsdoc-require-2\/require["']\s*:\s*\[?\s*)(?:(["'])(off|warn|error)\2|([012])(?![\w.]))/g;

// The rule key alone. A config that sets the severity on the following line is
// reported as unrecognized rather than silently left unchanged.
const RULE_KEY = /["']tsdoc-require-2\/require["']\s*:/;

const FROM_NUMERIC: Readonly<Record<string, RuleSeverity>> = Object.freeze({
  "0": "off",
  "1": "warn",
  "2": "error",
});

const TO_NUMERIC: Readonly<Record<Severity, string>> = Object.freeze({
  warn: "1",
  error: "2",
});

/**
 * Narrows a captured string to a {@link RuleSeverity}.
 *
 * @param value - The captured group, or `undefined` when it did not participate.
 * @returns The severity, or `undefined` when the group was absent.
 */
function asSeverity(value: string | undefined): RuleSeverity | undefined {
  return value === "off" || value === "warn" || value === "error"
    ? value
    : undefined;
}

/**
 * Explains why no assignment could be rewritten.
 *
 * @param sawRuleKey - Whether the rule key appears in real code at all.
 * @param disabledCount - How many assignments were explicitly `off`.
 * @returns The failure reason shown to the user.
 */
function explainMiss(sawRuleKey: boolean, disabledCount: number): string {
  if (disabledCount > 0) {
    return `"${PRESENCE_RULE_ID}" is disabled everywhere in this config — enable it (or re-run \`jsdoc-to-tsdoc init\`) before escalating.`;
  }
  if (sawRuleKey) {
    return `Found "${PRESENCE_RULE_ID}" but could not read its severity — set it manually.`;
  }
  return `"${PRESENCE_RULE_ID}" is not configured — run \`jsdoc-to-tsdoc init\` first.`;
}

/**
 * Rewrites the severity of every enabled `tsdoc-require-2/require` assignment.
 *
 * @param source - The current flat-config file contents.
 * @param options - The target severity (`error` locks the codebase in; `warn`
 * walks an escalation back).
 * @returns A {@link RuleSeverityUpdate}: the rewritten content plus the
 * assignments it touched, or a failure explaining why none were found.
 *
 * @example
 * ```typescript
 * updateRuleSeverity('"tsdoc-require-2/require": "warn",', { severity: "error" });
 * // { ok: true, changed: true, content: '"tsdoc-require-2/require": "error",', … }
 * ```
 */
export function updateRuleSeverity(
  source: string,
  options: { readonly severity: Severity },
): RuleSeverityUpdate {
  const occurrences: SeverityOccurrence[] = [];
  let sawRuleKey = false;
  let disabledCount = 0;

  const content = readConfigLines(source)
    .map((line, index) => {
      if (!line.isCode) {
        return line.text;
      }
      if (RULE_KEY.test(line.text)) {
        sawRuleKey = true;
      }

      return line.text.replace(
        ASSIGNMENT,
        (
          match: string,
          prefix: string,
          quote: string | undefined,
          word: string | undefined,
          numeric: string | undefined,
        ): string => {
          const from =
            asSeverity(word) ??
            (numeric === undefined ? undefined : FROM_NUMERIC[numeric]);
          // The alternation guarantees one branch matched; a miss would be a
          // regex bug, and leaving the line alone is the safe reaction.
          if (from === undefined || from === "off") {
            if (from === "off") {
              disabledCount += 1;
            }
            return match;
          }

          occurrences.push({ line: index + 1, from });
          return quote === undefined
            ? `${prefix}${TO_NUMERIC[options.severity]}`
            : `${prefix}${quote}${options.severity}${quote}`;
        },
      );
    })
    .join("\n");

  if (occurrences.length === 0) {
    return { ok: false, reason: explainMiss(sawRuleKey, disabledCount) };
  }

  return { ok: true, content, changed: content !== source, occurrences };
}
