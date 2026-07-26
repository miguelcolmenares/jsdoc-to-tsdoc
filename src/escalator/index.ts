/**
 * @packageDocumentation
 * Public API of the escalator domain: the preflight lint check and the
 * severity patch that together lock a migrated codebase in by moving
 * `tsdoc-require-2/require` from `warn` to `error`.
 *
 * @since 0.1.0
 */

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
