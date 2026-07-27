/**
 * Rule composition for the JSDoc → TSDoc conversion pipeline.
 *
 * @remarks
 * A conversion is an ordered application of independent {@link Rule}s over a
 * single comment string. Rules are pure and deterministic: the same input
 * always yields the same output, with no time, randomness, or I/O. `--lite`
 * mode runs only the `@param` / `@returns` hygiene subset (rules flagged
 * {@link Rule.liteSafe}), leaving prose and custom tags untouched.
 *
 * A rule sees the comment and the {@link RuleContext} — nothing else, and in
 * particular not the code the comment documents. Where a decision depends on
 * that code, the caller makes it and passes the answer in.
 *
 * @since 0.1.0
 */

import { RULES } from "@/transformer/rules";

/**
 * Flags that influence which rules run and how.
 */
export interface RuleContext {
  /** When `true`, only {@link Rule.liteSafe} rules run. */
  readonly lite: boolean;
  /**
   * The `@property` tags this comment may delete, by member name.
   *
   * @remarks
   * Every other tag the pipeline removes is redundant with the TypeScript
   * signature, so a rule can decide from the comment alone. `@property` is not:
   * its description exists nowhere else, and whether deleting it loses prose
   * depends on the declaration below the comment — which the pipeline never
   * sees. So the decision is made by the caller that does have the AST, and
   * passed in per comment.
   *
   * Omitting the field removes nothing. A caller that cannot prove a deletion
   * is safe must not have that treated as proof it is.
   */
  readonly removableProperties?: readonly string[];
}

/**
 * A single, independent comment transformation.
 */
export interface Rule {
  /** Stable kebab-case identifier, used in reports and `--only`-style filters. */
  readonly name: string;
  /** One-line description of what the rule changes. */
  readonly summary: string;
  /** Whether the rule runs in `--lite` mode (pure `@param` / `@returns` hygiene). */
  readonly liteSafe: boolean;
  /**
   * Applies the transformation.
   *
   * @remarks
   * Most rules decide from the comment alone and ignore the context; it is
   * there for the ones whose decision depends on the code the comment
   * documents, which only the caller can see.
   *
   * @param comment - The full `/** *\/` comment text.
   * @param context - The same flags {@link runPipeline} was given.
   * @returns The rewritten comment, or the input unchanged if nothing matched.
   */
  apply(comment: string, context: RuleContext): string;
}

/**
 * The outcome of running the pipeline over one comment.
 */
export interface PipelineResult {
  /** The final comment text after all applicable rules ran. */
  readonly output: string;
  /** Whether the output differs from the input. */
  readonly changed: boolean;
  /** Names of the rules that produced a change, in application order. */
  readonly appliedRules: readonly string[];
}

/**
 * Runs the conversion pipeline over a single comment.
 *
 * @param comment - The full `/** *\/` comment text to convert.
 * @param context - Flags controlling which rules run.
 * @returns The converted comment plus metadata about which rules fired.
 */
export function runPipeline(
  comment: string,
  context: RuleContext,
): PipelineResult {
  const rules = context.lite ? RULES.filter((rule) => rule.liteSafe) : RULES;

  let output = comment;
  const appliedRules: string[] = [];

  for (const rule of rules) {
    const next = rule.apply(output, context);
    if (next !== output) {
      appliedRules.push(rule.name);
      output = next;
    }
  }

  return { output, changed: output !== comment, appliedRules };
}
