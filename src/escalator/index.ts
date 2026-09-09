/**
 * @packageDocumentation
 * Public API of the escalator domain: the preflight lint check, the severity
 * patch that together lock a migrated codebase in by moving
 * `tsdoc-require-2/require` from `warn` to `error`, and the merge-conflict
 * resolver for that same escalation line.
 *
 * @since 0.1.0
 */

export {
  resolveSeverityConflict,
  type SeverityConflictOutcome,
} from "@/escalator/conflict-resolver";

export {
  collectRuleViolations,
  runPreflight,
  type PreflightOptions,
  type PreflightResult,
  type PreflightViolation,
} from "@/escalator/preflight-check";

export {
  PRESENCE_RULE_ID,
  updateRuleSeverity,
  type RuleSeverity,
  type RuleSeverityUpdate,
  type SeverityOccurrence,
} from "@/escalator/rule-updater";
