import { describe, expect, it } from "vitest";

import { createColors, shouldUseColor } from "@/reporter/colors";
import { formatFileDiff } from "@/reporter/dry-run-reporter";
import { toJsonReport, toMarkdownTable } from "@/reporter/json-reporter";
import { formatConvertSummary, formatTable } from "@/reporter/summary-reporter";

const plain = createColors(false);

describe("createColors", () => {
  it("returns identity functions when disabled", () => {
    expect(plain.red("x")).toBe("x");
    expect(plain.bold("y")).toBe("y");
  });

  it("wraps text in escape codes when enabled", () => {
    const colors = createColors(true);
    expect(colors.green("ok")).toContain("ok");
    expect(colors.green("ok")).not.toBe("ok");
  });
});

describe("shouldUseColor", () => {
  it("is false when NO_COLOR is set", () => {
    expect(shouldUseColor(true, { NO_COLOR: "1" })).toBe(false);
  });

  it("follows the TTY flag otherwise", () => {
    expect(shouldUseColor(true, {})).toBe(true);
    expect(shouldUseColor(false, {})).toBe(false);
  });
});

describe("formatFileDiff", () => {
  it("returns an empty string for identical content", () => {
    expect(formatFileDiff("a.ts", "same", "same", plain)).toBe("");
  });

  it("includes added and removed lines", () => {
    const diff = formatFileDiff("a.ts", "old line\n", "new line\n", plain);
    expect(diff).toContain("-old line");
    expect(diff).toContain("+new line");
  });
});

describe("formatTable", () => {
  it("renders a bordered two-column table", () => {
    const table = formatTable(
      [
        { label: "Files", value: 10 },
        { label: "Exports", value: 87 },
      ],
      plain,
    );
    expect(table).toContain("Files");
    expect(table).toContain("87");
    expect(table).toContain("┌");
    expect(table).toContain("┘");
  });
});

describe("formatConvertSummary", () => {
  it("reports a clean run", () => {
    const summary = formatConvertSummary(
      {
        filesScanned: 5,
        filesChanged: 0,
        commentsChanged: 0,
        membersDocumented: 0,
        commentsPromoted: 0,
        wrote: false,
      },
      plain,
    );
    expect(summary).toContain("Nothing to convert");
  });

  it("reports converted counts", () => {
    const summary = formatConvertSummary(
      {
        filesScanned: 5,
        filesChanged: 2,
        commentsChanged: 7,
        membersDocumented: 0,
        commentsPromoted: 0,
        wrote: true,
      },
      plain,
    );
    expect(summary).toContain("converted 7 comment(s)");
    expect(summary).toContain("2/5");
    expect(summary).not.toContain("@property");
  });

  // Moving prose between declarations is the one change a reader cannot infer
  // from the comment count, so it is stated rather than folded in.
  it("calls out relocated @property descriptions", () => {
    const summary = formatConvertSummary(
      {
        filesScanned: 1,
        filesChanged: 1,
        commentsChanged: 1,
        membersDocumented: 7,
        commentsPromoted: 0,
        wrote: true,
      },
      plain,
    );
    // Worded for members generally: the relocation also covers a type alias
    // over a type literal, which "interface members" would exclude.
    expect(summary).toContain(
      "7 @property description(s) moved onto the members they document",
    );
  });

  // Promotion turns lines that were not documentation into documentation, so
  // the comment count does not account for it either.
  it("calls out promoted line comments", () => {
    const summary = formatConvertSummary(
      {
        filesScanned: 3,
        filesChanged: 2,
        commentsChanged: 4,
        membersDocumented: 0,
        commentsPromoted: 5,
        wrote: true,
      },
      plain,
    );
    expect(summary).toContain("5 line comment(s) promoted to /** */");
  });
});

describe("report formats", () => {
  it("serializes JSON with indentation", () => {
    expect(toJsonReport({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("renders a Markdown table", () => {
    const md = toMarkdownTable("Category", [{ label: "Files", value: 3 }]);
    expect(md).toContain("| Category | Count |");
    expect(md).toContain("| Files | 3 |");
  });
});
