import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAnthropicProvider,
  type AnthropicClient,
} from "@/enricher/anthropic-provider";
import type { EnrichmentTarget } from "@/enricher/types";

const target: EnrichmentTarget = {
  path: "src/greet.ts",
  declaration: {
    name: "greet",
    line: 7,
    kind: "function",
    topology: "stale",
    gaps: [],
    stale: ["@param 'name' is not a parameter of greet (found: userId)"],
  },
};

const originalKey = process.env.ANTHROPIC_API_KEY;
const originalModel = process.env.ANTHROPIC_MODEL;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalKey;
  }
  if (originalModel === undefined) {
    delete process.env.ANTHROPIC_MODEL;
  } else {
    process.env.ANTHROPIC_MODEL = originalModel;
  }
});

/** Builds a fake client whose `messages.create` resolves to `content`. */
function fakeClient(
  content: readonly { readonly type: string; readonly text?: string }[],
): { client: AnthropicClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({ content });
  return { client: { messages: { create } }, create };
}

describe("createAnthropicProvider", () => {
  it("reports 'unavailable' without calling createClient when no API key is set", async () => {
    const createClient = vi.fn();
    const provider = createAnthropicProvider(createClient);

    const outcome = await provider.suggest(target);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("unavailable");
      expect(outcome.detail).toContain("ANTHROPIC_API_KEY");
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports 'unavailable' when the SDK cannot be loaded", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const createClient = vi
      .fn()
      .mockRejectedValue(new Error("Cannot find package '@anthropic-ai/sdk'"));
    const provider = createAnthropicProvider(createClient);

    const outcome = await provider.suggest(target);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("unavailable");
      expect(outcome.detail).toContain("@anthropic-ai/sdk");
      expect(outcome.detail).toContain("not installed");
    }
  });

  it("returns the joined text blocks as the suggestion on success", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { client, create } = fakeClient([
      { type: "text", text: "/** Greets a user. */" },
    ]);
    const provider = createAnthropicProvider(() => Promise.resolve(client));

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: true,
      suggestion: "/** Greets a user. */",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-5",
        messages: [
          {
            role: "user",
            content: expect.stringContaining("src/greet.ts") as unknown,
          },
        ],
      }),
    );
  });

  it("ignores non-text content blocks (e.g. thinking) when joining the suggestion", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { client } = fakeClient([
      { type: "thinking", text: "reasoning about it" },
      { type: "text", text: "/** Adds one. */" },
    ]);
    const provider = createAnthropicProvider(() => Promise.resolve(client));

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({ ok: true, suggestion: "/** Adds one. */" });
  });

  it("uses ANTHROPIC_MODEL when set, instead of the default", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    const { client, create } = fakeClient([{ type: "text", text: "doc" }]);
    const provider = createAnthropicProvider(() => Promise.resolve(client));

    await provider.suggest(target);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });

  it("reports 'error' with no text content", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const { client } = fakeClient([{ type: "thinking", text: "only this" }]);
    const provider = createAnthropicProvider(() => Promise.resolve(client));

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: false,
      reason: "error",
      detail: "Anthropic returned no text content.",
    });
  });

  it("reports 'error' when the API call rejects (e.g. rate limit)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const create = vi.fn().mockRejectedValue(new Error("429 rate limited"));
    const provider = createAnthropicProvider(() =>
      Promise.resolve({ messages: { create } }),
    );

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: false,
      reason: "error",
      detail: "429 rate limited",
    });
  });

  it("is named 'anthropic'", () => {
    expect(createAnthropicProvider(vi.fn()).name).toBe("anthropic");
  });
});
