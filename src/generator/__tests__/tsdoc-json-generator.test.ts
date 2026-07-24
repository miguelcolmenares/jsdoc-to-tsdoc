import { describe, expect, it } from "vitest";

import { generateTsdocJson, mergeTsdocJson } from "@/generator/tsdoc-json-generator";

describe("generateTsdocJson", () => {
  it("emits the minimal document when there are no custom tags", () => {
    const output = generateTsdocJson([]);
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(parsed["$schema"]).toContain("tsdoc.schema.json");
    expect(parsed["tagDefinitions"]).toBeUndefined();
    expect(output.endsWith("\n")).toBe(true);
  });

  it("registers custom tags as block, sorted and de-duplicated", () => {
    const output = generateTsdocJson(["@since", "@author", "@since"]);
    const parsed = JSON.parse(output) as {
      tagDefinitions: { tagName: string; syntaxKind: string }[];
    };

    expect(parsed.tagDefinitions).toEqual([
      { tagName: "@author", syntaxKind: "block" },
      { tagName: "@since", syntaxKind: "block" },
    ]);
  });
});

describe("mergeTsdocJson", () => {
  it("adds missing definitions while preserving existing ones", () => {
    const existing = JSON.stringify({
      $schema: "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
      tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
    });

    const merged = mergeTsdocJson(existing, ["@since", "@author"]);
    const parsed = JSON.parse(merged) as {
      tagDefinitions: { tagName: string }[];
    };

    const names = parsed.tagDefinitions.map((definition) => definition.tagName);
    expect(names).toEqual(["@since", "@author"]);
  });

  it("preserves unrelated fields and injects a missing schema", () => {
    const merged = mergeTsdocJson(`{ "supportForTags": { "@foo": true } }`, ["@since"]);
    const parsed = JSON.parse(merged) as Record<string, unknown>;

    expect(parsed["supportForTags"]).toEqual({ "@foo": true });
    expect(parsed["$schema"]).toContain("tsdoc.schema.json");
  });

  it("falls back to a fresh document when the input is not valid JSON", () => {
    const merged = mergeTsdocJson("not json {", ["@since"]);
    const parsed = JSON.parse(merged) as {
      tagDefinitions: { tagName: string }[];
    };

    expect(parsed.tagDefinitions).toEqual([{ tagName: "@since", syntaxKind: "block" }]);
  });

  it("tolerates malformed existing tagDefinitions without throwing", () => {
    const existing = JSON.stringify({
      $schema: "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
      tagDefinitions: [null, 42, { syntaxKind: "block" }, { tagName: "@author" }],
    });

    const merged = mergeTsdocJson(existing, ["@since", "@author"]);
    const parsed = JSON.parse(merged) as {
      tagDefinitions: unknown[];
    };

    const names = parsed.tagDefinitions
      .filter(
        (d): d is { tagName: string } =>
          typeof d === "object" && d !== null && "tagName" in d,
      )
      .map((d) => d.tagName);
    // @author already known (not duplicated); @since added; malformed kept.
    expect(names).toContain("@author");
    expect(names).toContain("@since");
    expect(names.filter((n) => n === "@author")).toHaveLength(1);
  });

  it("regenerates when the existing document is a JSON array", () => {
    const merged = mergeTsdocJson("[]", ["@since"]);
    const parsed = JSON.parse(merged) as {
      $schema: string;
      tagDefinitions: { tagName: string }[];
    };

    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.$schema).toContain("tsdoc.schema.json");
    expect(parsed.tagDefinitions).toEqual([{ tagName: "@since", syntaxKind: "block" }]);
  });
});
