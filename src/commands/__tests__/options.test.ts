import { describe, expect, it } from "vitest";

import {
  interactiveConflict,
  parseReportFormat,
  splitGlobs,
} from "@/commands/options";

const OK = {
  interactive: true,
  dryRun: false,
  check: false,
  report: false,
  isTTY: true,
};

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

describe("interactiveConflict", () => {
  it("permits interactive on a TTY with no non-writing flags", () => {
    expect(interactiveConflict(OK)).toBeUndefined();
  });

  it("ignores every other flag when interactive is off", () => {
    expect(
      interactiveConflict({
        interactive: false,
        dryRun: true,
        check: true,
        report: true,
        isTTY: false,
      }),
    ).toBeUndefined();
  });

  it("rejects the non-writing flags and names them", () => {
    expect(interactiveConflict({ ...OK, dryRun: true })).toContain(
      "--dry-run/--preview",
    );
    expect(interactiveConflict({ ...OK, check: true })).toContain("--check");
    expect(interactiveConflict({ ...OK, report: true })).toContain("--report");
  });

  it("lists every conflicting flag at once", () => {
    const message = interactiveConflict({
      ...OK,
      dryRun: true,
      check: true,
      report: true,
    });
    expect(message).toContain("--dry-run/--preview");
    expect(message).toContain("--check");
    expect(message).toContain("--report");
  });

  it("requires a TTY once the flags are clear", () => {
    expect(interactiveConflict({ ...OK, isTTY: false })).toContain("TTY");
  });
});
