/**
 * @packageDocumentation
 * Public API of the scaffolder domain: deterministic summary inference from
 * identifier names and TSDoc stub rendering for undocumented exports.
 *
 * @since 0.1.0
 */

export {
  inferComponentSummary,
  inferFunctionSummary,
  inferGroupSummary,
  inferHookSummary,
  inferNounSummary,
  splitIdentifier,
} from "@/scaffolder/name-inference";

export { buildStub, TODO_MARKER } from "@/scaffolder/stub-builder";
