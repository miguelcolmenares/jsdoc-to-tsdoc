import { describe, expect, it } from "vitest";

import { parseReportFormat, splitGlobs } from "@/commands/options";

describe("splitGlobs", () => {
  it("returns an empty array for missing or blank values", () => {
    expect(splitGlobs(undefined)).toEqual([]);
    expect(splitGlobs("")).toEqual([]);
    expect(splitGlobs("   ")).toEqual([]);
  });

  it("splits and trims a comma-separated list", () => {
    expect(splitGlobs("src/lib/** , src/actions/**")).toEqual([
      "src/lib/**",
      "src/actions/**",
    ]);
  });

  it("drops empty segments", () => {
    expect(splitGlobs("a,,b,")).toEqual(["a", "b"]);
  });
});

describe("parseReportFormat", () => {
  it("accepts the known machine-readable formats", () => {
    expect(parseReportFormat("json")).toBe("json");
    expect(parseReportFormat("md")).toBe("md");
  });

  it("returns undefined for unknown or missing values (default human output)", () => {
    expect(parseReportFormat("table")).toBeUndefined();
    expect(parseReportFormat("xml")).toBeUndefined();
    expect(parseReportFormat(undefined)).toBeUndefined();
  });
});
