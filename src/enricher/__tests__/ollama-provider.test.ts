import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOllamaProvider,
  type FetchLike,
} from "@/enricher/ollama-provider";
import type { EnrichmentTarget } from "@/enricher/types";

const target: EnrichmentTarget = {
  path: "src/math.ts",
  declaration: {
    name: "inc",
    line: 3,
    kind: "function",
    topology: "no-docs",
    gaps: [],
    stale: [],
  },
};

const originalHost = process.env.OLLAMA_HOST;
const originalModel = process.env.OLLAMA_MODEL;

beforeEach(() => {
  delete process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_MODEL;
});

afterEach(() => {
  if (originalHost === undefined) {
    delete process.env.OLLAMA_HOST;
  } else {
    process.env.OLLAMA_HOST = originalHost;
  }
  if (originalModel === undefined) {
    delete process.env.OLLAMA_MODEL;
  } else {
    process.env.OLLAMA_MODEL = originalModel;
  }
});

describe("createOllamaProvider", () => {
  it("returns the trimmed completion as the suggestion on success", async () => {
    const fetchFn: FetchLike = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: "\n/** Adds one. */\n" }),
      text: () => Promise.resolve(""),
    });
    const provider = createOllamaProvider(fetchFn);

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({ ok: true, suggestion: "/** Adds one. */" });
  });

  it("posts to the default host and model when neither env var is set", async () => {
    const fetchFn: FetchLike = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: "suggestion" }),
      text: () => Promise.resolve(""),
    });
    const provider = createOllamaProvider(fetchFn);

    await provider.suggest(target);

    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      vi.mocked(fetchFn).mock.calls[0]?.[1]?.body ?? "{}",
    ) as { model?: string; stream?: boolean };
    expect(body.model).toBe("llama3.1");
    expect(body.stream).toBe(false);
  });

  it("honors OLLAMA_HOST and OLLAMA_MODEL when set", async () => {
    process.env.OLLAMA_HOST = "http://example.internal:9999";
    process.env.OLLAMA_MODEL = "mistral";
    const fetchFn: FetchLike = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: "suggestion" }),
      text: () => Promise.resolve(""),
    });
    const provider = createOllamaProvider(fetchFn);

    await provider.suggest(target);

    expect(fetchFn).toHaveBeenCalledWith(
      "http://example.internal:9999/api/generate",
      expect.anything(),
    );
  });

  it("reports 'unavailable' when the daemon cannot be reached", async () => {
    const fetchFn: FetchLike = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    const provider = createOllamaProvider(fetchFn);

    const outcome = await provider.suggest(target);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("unavailable");
      expect(outcome.detail).toContain("ECONNREFUSED");
    }
  });

  it("reports 'error' on a non-OK HTTP response", async () => {
    const fetchFn: FetchLike = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('model "mistral" not found'),
    });
    const provider = createOllamaProvider(fetchFn);

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: false,
      reason: "error",
      detail: 'Ollama returned HTTP 404: model "mistral" not found',
    });
  });

  it("reports 'error' when the daemon answers with an empty completion", async () => {
    const fetchFn: FetchLike = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: "" }),
      text: () => Promise.resolve(""),
    });
    const provider = createOllamaProvider(fetchFn);

    const outcome = await provider.suggest(target);

    expect(outcome).toEqual({
      ok: false,
      reason: "error",
      detail: "Ollama returned an empty completion.",
    });
  });

  it("is named 'ollama'", () => {
    expect(createOllamaProvider(vi.fn()).name).toBe("ollama");
  });
});
