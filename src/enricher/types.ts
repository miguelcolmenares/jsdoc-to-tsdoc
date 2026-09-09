/**
 * Shared shapes for the opt-in LLM enrichment domain: what a provider is asked,
 * and the two ways it can answer.
 *
 * @remarks
 * Nothing here performs I/O. A provider's actual network or subprocess call
 * lives behind {@link EnrichmentProvider.suggest}, one file per provider, so
 * this module can be imported anywhere in the domain without pulling in a
 * `fetch` call or a spawned process.
 *
 * @since 0.3.0
 */

import type { DeclarationClassification } from "@/classifier";

/**
 * The providers `--enrich` can select.
 *
 * @remarks
 * Kept as a closed string union, not an enum, to match how every other
 * CLI-facing choice in this codebase is typed (`Severity`, `ReportFormat`).
 */
export type EnrichProviderName = "copilot" | "ollama" | "anthropic";

/**
 * One declaration `scan --classify` already flagged as worth a second opinion,
 * with the file it lives in.
 */
export interface EnrichmentTarget {
  /** Path to the file, relative to the scanned directory. */
  readonly path: string;
  /** The declaration's classification — name, kind, line, gaps, and why it is stale. */
  readonly declaration: DeclarationClassification;
}

/**
 * The result of asking a provider for a suggestion.
 *
 * @remarks
 * A discriminated union rather than a throw, per this project's fallible-
 * operations convention (`AGENTS.md` §4 decision #10): an unavailable CLI, a
 * missing API key, or an unreachable daemon are expected outcomes a caller
 * branches on, not exceptions that unwind the report a user is waiting on.
 * `"unavailable"` means the provider itself could not be reached (no
 * credential, no binary, no daemon); `"error"` means it was reached but the
 * request itself failed (rate limit, bad response, timeout).
 */
export type EnrichmentOutcome =
  | { readonly ok: true; readonly suggestion: string }
  | {
      readonly ok: false;
      readonly reason: "unavailable" | "error";
      readonly detail: string;
    };

/**
 * A provider capable of suggesting documentation for one flagged declaration.
 *
 * @remarks
 * Each implementation (`copilot`, `ollama`, `anthropic`) keeps its actual I/O —
 * `child_process`, `fetch`, or an SDK call — behind an injected function, so
 * tests exercise prompt construction, response parsing, and error handling
 * against a fake rather than a real process or network call.
 */
export interface EnrichmentProvider {
  /** Which provider this is, for reporting which one ran (or failed). */
  readonly name: EnrichProviderName;
  /**
   * Asks the provider for a suggested TSDoc comment for one target.
   *
   * @param target - The flagged declaration and the file it lives in.
   * @returns The suggestion, or a reported reason it could not be produced.
   * Never rejects — every failure mode the provider can hit is folded into the
   * `ok: false` branch.
   */
  suggest(target: EnrichmentTarget): Promise<EnrichmentOutcome>;
}
