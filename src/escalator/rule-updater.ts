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

import { readConfigLines, type ConfigLine, type Severity } from "@/generator";

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

// The rule key alone, counted so that keys carrying a severity this module
// cannot read (a variable, a value on the following line, a stray `10`) are
// told apart from keys that were read and turned out to be `off`.
const RULE_KEY = /["']tsdoc-require-2\/require["']\s*:/g;

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
 * Applies a replacement to the code portion of a line only.
 *
 * @remarks
 * Matches are searched in {@link ConfigLine.code}, where comment characters are
 * blanked, but spliced into {@link ConfigLine.text}. The mask is
 * length-preserving, so a span found in one is the same span in the other — and
 * a match can never land inside a comment.
 *
 * @param line - The line to rewrite.
 * @param pattern - A global regex to search for.
 * @param replacer - Builds the replacement, or returns `undefined` to leave a
 * match untouched.
 * @returns The line's text with every accepted match replaced.
 */
function replaceInCode(
  line: ConfigLine,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string | undefined,
): string {
  pattern.lastIndex = 0;
  const parts: string[] = [];
  let cursor = 0;
  let match = pattern.exec(line.code);

  while (match !== null) {
    const replacement = replacer(match);
    if (replacement !== undefined) {
      parts.push(line.text.slice(cursor, match.index), replacement);
      cursor = match.index + match[0].length;
    }
    // A zero-length match would otherwise spin forever on the same offset.
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
    }
    match = pattern.exec(line.code);
  }

  parts.push(line.text.slice(cursor));
  return parts.join("");
}

/**
 * Explains why no assignment could be rewritten.
 *
 * @remarks
 * The unreadable-severity case is reported ahead of the disabled one: a config
 * mixing an explicit `off` with a key this module cannot parse is not "disabled
 * everywhere", and telling the user to enable a rule that is already enabled
 * somewhere would send them after the wrong problem.
 *
 * @param keyCount - How many `tsdoc-require-2/require` keys appear in real code.
 * @param disabledCount - How many of them were read and turned out to be `off`.
 * @returns The failure reason shown to the user.
 */
function explainMiss(keyCount: number, disabledCount: number): string {
  if (keyCount === 0) {
    return `"${PRESENCE_RULE_ID}" is not configured — run \`jsdoc-to-tsdoc init\` first.`;
  }
  // Reached only when nothing was rewritten, so every readable key was `off`.
  if (keyCount > disabledCount) {
    return `Found "${PRESENCE_RULE_ID}" but could not read its severity — set it manually.`;
  }
  return `"${PRESENCE_RULE_ID}" is disabled everywhere in this config — enable it (or re-run \`jsdoc-to-tsdoc init\`) before escalating.`;
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
  let keyCount = 0;
  let disabledCount = 0;

  const content = readConfigLines(source)
    .map((line, index) => {
      // `String.match` with a global regex returns every hit and leaves no
      // `lastIndex` state behind, so the count is safe to take per line.
      keyCount += line.code.match(RULE_KEY)?.length ?? 0;

      return replaceInCode(line, ASSIGNMENT, (match) => {
        const [, prefix, quote, word, numeric] = match;
        const from =
          asSeverity(word) ??
          (numeric === undefined ? undefined : FROM_NUMERIC[numeric]);

        // The alternation guarantees one branch matched; a miss would be a
        // regex bug, and leaving the match alone is the safe reaction.
        if (from === undefined || prefix === undefined) {
          return undefined;
        }
        // An explicit `off` is a deliberate opt-out, never something to enable.
        if (from === "off") {
          disabledCount += 1;
          return undefined;
        }

        occurrences.push({ line: index + 1, from });
        return quote === undefined
          ? `${prefix}${TO_NUMERIC[options.severity]}`
          : `${prefix}${quote}${options.severity}${quote}`;
      });
    })
    .join("\n");

  if (occurrences.length === 0) {
    return { ok: false, reason: explainMiss(keyCount, disabledCount) };
  }

  return { ok: true, content, changed: content !== source, occurrences };
}
