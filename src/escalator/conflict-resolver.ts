/**
 * Automatic resolution of a git merge conflict on the presence rule's
 * severity line.
 *
 * @remarks
 * {@link updateRuleSeverity} documents why the escalation line — the single
 * assignment that flips `tsdoc-require-2/require` from `warn` to `error` —
 * is "the only line that ever conflicts on a long-lived migration branch": a
 * rebase that carries the escalation past a commit that also touched it (say,
 * a second escalation attempt, or a revert) leaves git unable to pick a side
 * on its own.
 *
 * This module answers a narrower question than a general-purpose merge: is
 * the conflict *exactly* that — the same line differing only in its severity
 * value, with nothing else in the file disturbed? If so, `error` wins,
 * because escalation only ever moves one direction. If anything else
 * differs — a second changed line, a differing line count, an `off` on
 * either side — this reports failure rather than guess. Resolving a conflict
 * this module is not certain about would be worse than leaving it for a
 * human, which is this project's conservative-by-design philosophy for every
 * transform (see `AGENTS.md` §4.2 and §8).
 *
 * @since 0.3.0
 */

import { readConfigLines, type ConfigLine } from "@/generator";

import { PRESENCE_RULE_ID, type RuleSeverity } from "@/escalator/rule-updater";

/**
 * The outcome of a conflict-resolution attempt.
 */
export interface SeverityConflictOutcome {
  /**
   * The resolved file content — including the pass-through case where "ours"
   * and "theirs" already agree — or `null` when the conflict is not the
   * specific, single-line severity shape this module handles, so the caller
   * should defer to a normal merge conflict instead.
   */
  readonly resolved: string | null;
}

// Mirrors `rule-updater.ts`'s `ASSIGNMENT` pattern for the one rule this
// module understands. Kept as its own copy rather than an import: that
// pattern serves `updateRuleSeverity`'s different job (rewrite every
// occurrence in a file), and a future change to it should not silently
// change what a merge conflict is allowed to auto-resolve.
const SEVERITY_ASSIGNMENT =
  /(["']tsdoc-require-2\/require["']\s*:\s*\[?\s*)(?:(["'])(off|warn|error)\2|([012])(?![\w.]))/g;

const FROM_NUMERIC: Readonly<Record<string, RuleSeverity>> = Object.freeze({
  "0": "off",
  "1": "warn",
  "2": "error",
});

/** Where the presence rule's severity token sits within one masked line. */
interface SeverityMatch {
  readonly severity: RuleSeverity;
  readonly start: number;
  readonly end: number;
}

/**
 * Locates the presence rule's severity assignment in one line of masked code.
 *
 * @param code - {@link ConfigLine.code} for the line — comment characters
 * already blanked, so a match can never land inside one.
 * @returns The assignment's severity and character span, or `undefined` when
 * the line carries zero or more than one assignment — either shape is one
 * this module does not trust itself to read.
 */
function readSeverityMatch(code: string): SeverityMatch | undefined {
  const matches = [...code.matchAll(SEVERITY_ASSIGNMENT)];
  if (matches.length !== 1) {
    return undefined;
  }
  const [match] = matches;
  if (match === undefined || match.index === undefined) {
    return undefined;
  }

  const word = match[3];
  const numeric = match[4];
  const severity =
    word === "off" || word === "warn" || word === "error"
      ? word
      : numeric === undefined
        ? undefined
        : FROM_NUMERIC[numeric];
  if (severity === undefined) {
    return undefined;
  }

  return { severity, start: match.index, end: match.index + match[0].length };
}

/**
 * Resolves one pair of conflicting lines, when the only difference between
 * them is the presence rule's severity token.
 *
 * @param ours - The "ours" version of the differing line.
 * @param theirs - The "theirs" version of the differing line.
 * @returns The winning side's original line text, verbatim (`error` beats
 * `warn`), or `undefined` when the line is not a single, recognizable
 * severity assignment, or something besides the severity token also differs.
 */
function resolveLine(ours: ConfigLine, theirs: ConfigLine): string | undefined {
  const oursMatch = readSeverityMatch(ours.code);
  const theirsMatch = readSeverityMatch(theirs.code);
  if (oursMatch === undefined || theirsMatch === undefined) {
    return undefined;
  }
  // The assignment must start at the same offset on both sides — otherwise
  // something ahead of it (indentation, an unrelated edit) also changed,
  // which is a second difference this module does not attempt to reconcile.
  // The end offset is deliberately not compared: "warn" and "error" are
  // different lengths, so the match itself always ends at different offsets
  // in the one case this module exists to resolve.
  if (oursMatch.start !== theirsMatch.start) {
    return undefined;
  }

  // Excising each side's matched span and comparing what is left catches any
  // difference outside the severity token — including one masked by the
  // length change above, since the slices are taken from each line's own end
  // offset rather than a shared one.
  const oursOutside =
    ours.text.slice(0, oursMatch.start) + ours.text.slice(oursMatch.end);
  const theirsOutside =
    theirs.text.slice(0, theirsMatch.start) +
    theirs.text.slice(theirsMatch.end);
  if (oursOutside !== theirsOutside) {
    return undefined;
  }

  const severities = new Set<RuleSeverity>([
    oursMatch.severity,
    theirsMatch.severity,
  ]);
  // Escalation only ever moves one direction: `warn` -> `error`. An `off` on
  // either side is a deliberate opt-out (see `rule-updater.ts`), never a
  // value this module decides on the author's behalf.
  if (
    severities.size !== 2 ||
    !severities.has("warn") ||
    !severities.has("error")
  ) {
    return undefined;
  }

  return oursMatch.severity === "error" ? ours.text : theirs.text;
}

/**
 * Resolves a git merge conflict on the ESLint flat config, when the conflict
 * is exactly the presence rule's severity escalation.
 *
 * @remarks
 * This is the pure core behind the `merge-driver` command, which implements
 * git's merge-driver file protocol (`%O %A %B`) around it. It never reads or
 * writes a file itself.
 *
 * @param base - The common-ancestor version of the file (git's `%O`).
 * @param ours - The current-branch version (git's `%A`).
 * @param theirs - The other-branch version (git's `%B`).
 * @returns `{ resolved: string }` with the merged content — `ours` verbatim
 * when the two sides already agree, otherwise the input with its one
 * differing line replaced by whichever side escalated to `error` — or
 * `{ resolved: null }` when the conflict is not this specific, single-line
 * shape and a human should resolve it instead.
 *
 * @example
 * ```typescript
 * // ours:   '"tsdoc-require-2/require": "warn",'
 * // theirs: '"tsdoc-require-2/require": "error",'
 * resolveSeverityConflict(base, ours, theirs);
 * // => { resolved: '"tsdoc-require-2/require": "error",' }
 * ```
 */
export function resolveSeverityConflict(
  base: string,
  ours: string,
  theirs: string,
): SeverityConflictOutcome {
  if (ours === theirs) {
    return { resolved: ours };
  }
  // A conflict on this rule can only be real if the rule was already present
  // in the shared ancestor — a cheap sanity check ahead of the line-by-line
  // comparison below.
  if (!base.includes(PRESENCE_RULE_ID)) {
    return { resolved: null };
  }

  const oursLines = readConfigLines(ours);
  const theirsLines = readConfigLines(theirs);
  if (oursLines.length !== theirsLines.length) {
    return { resolved: null };
  }

  let conflictIndex: number | undefined;
  for (let index = 0; index < oursLines.length; index += 1) {
    const oursLine = oursLines[index];
    const theirsLine = theirsLines[index];
    if (oursLine === undefined || theirsLine === undefined) {
      return { resolved: null };
    }
    if (oursLine.text !== theirsLine.text) {
      if (conflictIndex !== undefined) {
        // A second differing line — not the single-line conflict this
        // resolver handles.
        return { resolved: null };
      }
      conflictIndex = index;
    }
  }

  if (conflictIndex === undefined) {
    // Every line matched pairwise, yet `ours !== theirs` was already true —
    // for example a mismatched trailing newline, which `split("\n")` does not
    // surface as its own line. Not a shape this module understands.
    return { resolved: null };
  }

  const oursLine = oursLines[conflictIndex];
  const theirsLine = theirsLines[conflictIndex];
  if (oursLine === undefined || theirsLine === undefined) {
    return { resolved: null };
  }

  const resolvedLine = resolveLine(oursLine, theirsLine);
  if (resolvedLine === undefined) {
    return { resolved: null };
  }

  const resolvedLines = oursLines.map((line, index) =>
    index === conflictIndex ? resolvedLine : line.text,
  );
  return { resolved: resolvedLines.join("\n") };
}
