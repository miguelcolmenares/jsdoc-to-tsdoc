/**
 * @packageDocumentation
 * Public API of the enricher domain: opt-in LLM-assisted suggestions for the
 * LOW-confidence and STALE cases `scan --classify` already detects.
 *
 * @remarks
 * This domain is deliberately absent from the root library barrel
 * (`src/index.ts`), the same way `committer`, `prompter`, `reporter` and
 * `writer` are: it is CLI-only I/O (a subprocess, a local HTTP call, or an
 * external API), and a library consumer supplies its own. It exists only to
 * back `scan`'s `--enrich` flag, and it never runs unless that flag is passed
 * — see `src/commands/scan.ts`. Nothing here is part of the deterministic
 * pipeline `AGENTS.md` §3 describes (no time/randomness/I/O in `transformer`);
 * enrichment is a reporting feature of `scan --classify`, not a conversion
 * rule, which is why it lives in its own domain rather than under
 * `transformer/rules/`.
 *
 * @since 0.3.0
 */

import {
  confidenceOf,
  type DeclarationClassification,
  type FileClassification,
} from "@/classifier";
import { createAnthropicProvider } from "@/enricher/anthropic-provider";
import { createCopilotProvider } from "@/enricher/copilot-provider";
import { createOllamaProvider } from "@/enricher/ollama-provider";
import type {
  EnrichmentOutcome,
  EnrichmentProvider,
  EnrichmentTarget,
  EnrichProviderName,
} from "@/enricher/types";

export {
  createAnthropicProvider,
  type AnthropicClient,
} from "@/enricher/anthropic-provider";
export {
  createCopilotProvider,
  type ExecFile,
} from "@/enricher/copilot-provider";
export {
  createOllamaProvider,
  type FetchLike,
} from "@/enricher/ollama-provider";
export {
  type EnrichmentOutcome,
  type EnrichmentProvider,
  type EnrichmentTarget,
  type EnrichProviderName,
} from "@/enricher/types";

/**
 * Builds the provider named by `--enrich`.
 *
 * @remarks
 * The only place that maps the CLI-facing string to a concrete adapter.
 * Constructing a provider performs no I/O by itself — nothing runs until
 * {@link EnrichmentProvider.suggest} is called on a target.
 *
 * @param name - The requested provider.
 * @returns The corresponding {@link EnrichmentProvider}.
 */
export function createEnrichmentProvider(
  name: EnrichProviderName,
): EnrichmentProvider {
  switch (name) {
    case "copilot":
      return createCopilotProvider();
    case "ollama":
      return createOllamaProvider();
    case "anthropic":
      return createAnthropicProvider();
  }
}

/**
 * Picks the declarations worth a second opinion: the LOW-confidence and STALE
 * cases the issue names — everything `scan --classify` did not already call
 * `valid` or `partial`.
 *
 * @param files - Every scanned file's path and classification (or `null` for
 * a file with nothing to document), in the shape `scan --classify` already
 * builds.
 * @returns One {@link EnrichmentTarget} per flagged declaration, in file then
 * declaration order.
 */
export function selectEnrichmentTargets(
  files: readonly {
    readonly path: string;
    readonly classification: FileClassification | null;
  }[],
): readonly EnrichmentTarget[] {
  const targets: EnrichmentTarget[] = [];
  for (const { path, classification } of files) {
    if (classification === null) continue;
    for (const declaration of classification.declarations) {
      const confidence = confidenceOf(declaration.topology);
      if (confidence === "low" || confidence === "stale") {
        targets.push({ path, declaration });
      }
    }
  }
  return targets;
}

/**
 * Runs a provider over every target, one at a time.
 *
 * @remarks
 * Sequential rather than parallel on purpose: the targets are usually a small
 * subset of a scan, and running them one at a time avoids hammering a local
 * Ollama daemon or a rate-limited API with a burst of concurrent requests a
 * single flag just triggered.
 *
 * @param provider - The provider to run.
 * @param targets - The declarations to ask about.
 * @returns Every target's outcome, keyed by its
 * {@link EnrichmentTarget.declaration} — stable within one run, since each
 * declaration object is classified exactly once.
 */
export async function enrichTargets(
  provider: EnrichmentProvider,
  targets: readonly EnrichmentTarget[],
): Promise<ReadonlyMap<DeclarationClassification, EnrichmentOutcome>> {
  const outcomes = new Map<DeclarationClassification, EnrichmentOutcome>();
  for (const target of targets) {
    outcomes.set(target.declaration, await provider.suggest(target));
  }
  return outcomes;
}
