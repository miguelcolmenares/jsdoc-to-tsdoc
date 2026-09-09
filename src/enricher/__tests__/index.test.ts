import { describe, expect, it, vi } from "vitest";

import type {
  DeclarationClassification,
  FileClassification,
} from "@/classifier";
import {
  createEnrichmentProvider,
  enrichTargets,
  selectEnrichmentTargets,
} from "@/enricher";
import type { EnrichmentProvider, EnrichmentTarget } from "@/enricher/types";

/** Builds a single declaration classified with the given topology. */
function declarationOf(
  topology: DeclarationClassification["topology"],
): DeclarationClassification {
  return {
    name: `decl-${topology}`,
    line: 1,
    kind: "function",
    topology,
    gaps: [],
    stale: [],
  };
}

/** Builds a minimal file classification wrapping one declaration. */
function classificationOf(
  declaration: DeclarationClassification,
): FileClassification {
  const { topology } = declaration;
  return {
    topology,
    confidence:
      topology === "valid"
        ? "high"
        : topology === "partial"
          ? "medium"
          : topology === "stale"
            ? "stale"
            : "low",
    declarations: [declaration],
    counts: {
      valid: topology === "valid" ? 1 : 0,
      partial: topology === "partial" ? 1 : 0,
      "line-comments": topology === "line-comments" ? 1 : 0,
      "no-docs": topology === "no-docs" ? 1 : 0,
      stale: topology === "stale" ? 1 : 0,
    },
  };
}

describe("selectEnrichmentTargets", () => {
  it("selects only LOW-confidence and STALE declarations", () => {
    const files = [
      {
        path: "a.ts",
        classification: classificationOf(declarationOf("valid")),
      },
      {
        path: "b.ts",
        classification: classificationOf(declarationOf("partial")),
      },
      {
        path: "c.ts",
        classification: classificationOf(declarationOf("no-docs")),
      },
      {
        path: "d.ts",
        classification: classificationOf(declarationOf("line-comments")),
      },
      {
        path: "e.ts",
        classification: classificationOf(declarationOf("stale")),
      },
      { path: "f.ts", classification: null },
    ];

    const targets = selectEnrichmentTargets(files);

    expect(targets.map((t) => t.path)).toEqual(["c.ts", "d.ts", "e.ts"]);
    expect(targets.map((t) => t.declaration.topology)).toEqual([
      "no-docs",
      "line-comments",
      "stale",
    ]);
  });

  it("returns an empty list when nothing is flagged", () => {
    const files = [
      {
        path: "a.ts",
        classification: classificationOf(declarationOf("valid")),
      },
      { path: "b.ts", classification: null },
    ];

    expect(selectEnrichmentTargets(files)).toEqual([]);
  });
});

describe("enrichTargets", () => {
  it("runs the provider once per target and keys the outcome by declaration", async () => {
    const staleDeclaration = declarationOf("stale");
    const noDocsDeclaration = declarationOf("no-docs");
    const targets: EnrichmentTarget[] = [
      { path: "a.ts", declaration: staleDeclaration },
      { path: "b.ts", declaration: noDocsDeclaration },
    ];
    const suggest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, suggestion: "first" })
      .mockResolvedValueOnce({ ok: true, suggestion: "second" });
    const provider: EnrichmentProvider = { name: "ollama", suggest };

    const outcomes = await enrichTargets(provider, targets);

    expect(outcomes.get(staleDeclaration)).toEqual({
      ok: true,
      suggestion: "first",
    });
    expect(outcomes.get(noDocsDeclaration)).toEqual({
      ok: true,
      suggestion: "second",
    });
    expect(suggest).toHaveBeenCalledTimes(2);
  });

  it("runs targets sequentially, not in parallel", async () => {
    const order: string[] = [];
    const targets: EnrichmentTarget[] = [
      { path: "a.ts", declaration: declarationOf("stale") },
      { path: "b.ts", declaration: declarationOf("no-docs") },
    ];
    const provider: EnrichmentProvider = {
      name: "ollama",
      suggest: async (target) => {
        order.push(`start:${target.path}`);
        await Promise.resolve();
        order.push(`end:${target.path}`);
        return { ok: true, suggestion: target.path };
      },
    };

    await enrichTargets(provider, targets);

    expect(order).toEqual(["start:a.ts", "end:a.ts", "start:b.ts", "end:b.ts"]);
  });

  it("returns an empty map for an empty target list, without calling suggest", async () => {
    const suggest = vi.fn();
    const outcomes = await enrichTargets({ name: "copilot", suggest }, []);

    expect(outcomes.size).toBe(0);
    expect(suggest).not.toHaveBeenCalled();
  });
});

describe("createEnrichmentProvider", () => {
  it("builds a provider named after the requested provider, for each name", () => {
    expect(createEnrichmentProvider("copilot").name).toBe("copilot");
    expect(createEnrichmentProvider("ollama").name).toBe("ollama");
    expect(createEnrichmentProvider("anthropic").name).toBe("anthropic");
  });
});
