/**
 * @packageDocumentation
 * Public API of the transformer domain: the conversion pipeline and its rules.
 *
 * @since 0.1.0
 */

export {
  runPipeline,
  type PipelineResult,
  type Rule,
  type RuleContext,
} from "@/transformer/pipeline";

export { RULES } from "@/transformer/rules";
