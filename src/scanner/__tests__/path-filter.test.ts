import { describe, expect, it } from "vitest";

import {
  createPathFilter,
  matchesGlob,
  normalizePath,
} from "@/scanner/path-filter";

describe("matchesGlob", () => {
  it("matches a single-segment wildcard without crossing directories", () => {
    expect(matchesGlob("src/a.ts", "src/*.ts")).toBe(true);
    expect(matchesGlob("src/nested/a.ts", "src/*.ts")).toBe(false);
  });

  it("matches a globstar across directories", () => {
    expect(matchesGlob("src/actions/a.ts", "src/actions/**")).toBe(true);
    expect(matchesGlob("src/deep/nested/a.test.ts", "**/*.test.ts")).toBe(true);
  });

  it("matches a single character with ?", () => {
    expect(matchesGlob("a.ts", "?.ts")).toBe(true);
    expect(matchesGlob("ab.ts", "?.ts")).toBe(false);
  });

  it("escapes regex-significant characters in the pattern", () => {
    expect(matchesGlob("a.b.ts", "a.b.ts")).toBe(true);
    expect(matchesGlob("axbxts", "a.b.ts")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("src\\a\\b.ts")).toBe("src/a/b.ts");
  });
});

describe("createPathFilter", () => {
  it("keeps everything when no filters are given", () => {
    const filter = createPathFilter({});
    expect(filter("any/path.ts")).toBe(true);
  });

  it("requires a match against the only list", () => {
    const filter = createPathFilter({ only: ["src/lib/**"] });
    expect(filter("src/lib/api.ts")).toBe(true);
    expect(filter("src/app/page.tsx")).toBe(false);
  });

  it("drops paths matching the exclude list", () => {
    const filter = createPathFilter({ exclude: ["**/*.test.ts"] });
    expect(filter("src/a.ts")).toBe(true);
    expect(filter("src/a.test.ts")).toBe(false);
  });
});
