/**
 * Enrichment provider backed by a local Ollama daemon — no API key required,
 * matching the issue's framing of Ollama as the no-credential option.
 *
 * @since 0.3.0
 */

import { describeError, failure } from "@/enricher/error-utils";
import { buildPrompt } from "@/enricher/prompt";
import type {
  EnrichmentOutcome,
  EnrichmentProvider,
  EnrichmentTarget,
} from "@/enricher/types";

/** The subset of the global `fetch` this provider calls. */
export type FetchLike = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
}>;

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1";

/**
 * Reads the response body of a failed request for the error detail, tolerating
 * a body that cannot be read at all.
 *
 * @param response - The non-OK response.
 * @returns The body text, or an empty string when it could not be read.
 */
async function safeText(response: {
  readonly text: () => Promise<string>;
}): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Builds a provider that asks a local Ollama daemon for a suggestion.
 *
 * @remarks
 * Posts to `${OLLAMA_HOST ?? DEFAULT_HOST}/api/generate` with
 * `stream: false`, using `OLLAMA_MODEL` (default `llama3.1`). A connection
 * failure — no daemon listening — is reported as `"unavailable"`; a reachable
 * daemon returning a non-OK status or an empty completion is reported as
 * `"error"`.
 *
 * @param fetchFn - The HTTP client. Defaults to the global `fetch`; tests
 * inject a fake so no real network call is made.
 * @returns The `ollama` {@link EnrichmentProvider}.
 */
export function createOllamaProvider(
  fetchFn: FetchLike = fetch,
): EnrichmentProvider {
  return {
    name: "ollama",
    async suggest(target: EnrichmentTarget): Promise<EnrichmentOutcome> {
      const host = process.env.OLLAMA_HOST?.trim() || DEFAULT_HOST;
      const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;

      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchFn(`${host}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: buildPrompt(target),
            stream: false,
          }),
        });
      } catch (error) {
        return failure(
          "unavailable",
          `Ollama is not reachable at ${host}: ${describeError(error)}`,
        );
      }

      if (!response.ok) {
        const body = await safeText(response);
        return failure(
          "error",
          `Ollama returned HTTP ${String(response.status)}${body === "" ? "" : `: ${body}`}`,
        );
      }

      const payload = (await response.json()) as { response?: unknown };
      const suggestion =
        typeof payload.response === "string" ? payload.response.trim() : "";
      if (suggestion === "") {
        return failure("error", "Ollama returned an empty completion.");
      }
      return { ok: true, suggestion };
    },
  };
}
