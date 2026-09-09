/**
 * Enrichment provider backed by the Anthropic API, authenticated through an
 * env-provided API key — no interactive login, matching how the other two
 * providers are configured (a binary on `$PATH`, a local daemon).
 *
 * @remarks
 * `@anthropic-ai/sdk` is a `devDependency`, not a `dependency`: it is imported
 * lazily, from inside {@link suggest}, so a consumer who never passes
 * `--enrich=anthropic` never downloads it and it never enters the bundle
 * `build.config.ts` produces (it is also listed in `externals` there). A
 * project that wants `--enrich=anthropic` installs the SDK itself, the same
 * way `--enrich=copilot` needs the Copilot CLI on `$PATH` and
 * `--enrich=ollama` needs a running daemon — a missing package is reported as
 * `"unavailable"`, not a crash.
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

/**
 * The minimal slice of an `@anthropic-ai/sdk` client this provider calls.
 *
 * @remarks
 * Declared locally instead of importing the SDK's own types at the top of the
 * module, so nothing here forces a static import of a package that must stay
 * lazy. A real `Anthropic` client instance satisfies this structurally.
 */
export interface AnthropicClient {
  readonly messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: { role: "user"; content: string }[];
    }): Promise<{
      readonly content: readonly {
        readonly type: string;
        readonly text?: string;
      }[];
    }>;
  };
}

const DEFAULT_MODEL = "claude-opus-5";
const MAX_TOKENS = 1024;

/**
 * Lazily imports `@anthropic-ai/sdk` and constructs a client.
 *
 * @param apiKey - The API key to authenticate with.
 * @returns A live `Anthropic` client.
 * @throws When `@anthropic-ai/sdk` is not installed (module resolution
 * failure) — the caller turns this into a reported `"unavailable"` outcome.
 */
async function loadClient(apiKey: string): Promise<AnthropicClient> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey });
}

/**
 * Builds a provider that asks the Anthropic API for a suggestion.
 *
 * @remarks
 * Reads the key from `ANTHROPIC_API_KEY` and the model from `ANTHROPIC_MODEL`
 * (default `claude-opus-5`). A missing key or an uninstalled SDK is reported
 * as `"unavailable"` before any request is attempted; an authentication
 * failure, rate limit, or other API error is reported as `"error"`.
 *
 * @param createClient - Builds the client from an API key. Defaults to
 * lazily importing the real SDK; tests inject a fake client so no real HTTP
 * request is made.
 * @returns The `anthropic` {@link EnrichmentProvider}.
 */
export function createAnthropicProvider(
  createClient: (apiKey: string) => Promise<AnthropicClient> = loadClient,
): EnrichmentProvider {
  return {
    name: "anthropic",
    async suggest(target: EnrichmentTarget): Promise<EnrichmentOutcome> {
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (apiKey === undefined || apiKey === "") {
        return failure(
          "unavailable",
          "ANTHROPIC_API_KEY is not set. Export it to use --enrich=anthropic.",
        );
      }

      let client: AnthropicClient;
      try {
        client = await createClient(apiKey);
      } catch (error) {
        return failure(
          "unavailable",
          "@anthropic-ai/sdk is not installed. Run `npm install " +
            `@anthropic-ai/sdk\` to use --enrich=anthropic. (${describeError(error)})`,
        );
      }

      try {
        const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
        const response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: buildPrompt(target) }],
        });
        const suggestion = response.content
          .filter(
            (block): block is { type: string; text: string } =>
              block.type === "text" && typeof block.text === "string",
          )
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (suggestion === "") {
          return failure("error", "Anthropic returned no text content.");
        }
        return { ok: true, suggestion };
      } catch (error) {
        return failure("error", describeError(error));
      }
    },
  };
}
