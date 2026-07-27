import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aggregateCommentTags,
  collectProjectTags,
} from "@/generator/custom-tag-detector";
import { classifyTag } from "@/generator/tsdoc-tags";

describe("classifyTag", () => {
  it("recognizes standard, known-custom, and unknown tags", () => {
    expect(classifyTag("@param")).toBe("standard");
    expect(classifyTag("@packagedocumentation")).toBe("standard");
    expect(classifyTag("@since")).toBe("custom");
    expect(classifyTag("@author")).toBe("custom");
    expect(classifyTag("@foobar")).toBe("unknown");
  });
});

describe("aggregateCommentTags", () => {
  it("counts, classifies, and splits registerable from unknown tags", () => {
    const comments = [
      [
        "/**",
        " * Summary.",
        " * @param a - First.",
        " * @since 0.1.0",
        " */",
      ].join("\n"),
      [
        "/**",
        " * Another.",
        " * @param b - Second.",
        " * @foobar note",
        " */",
      ].join("\n"),
    ];

    const report = aggregateCommentTags(comments);

    const param = report.usages.find((usage) => usage.tag === "@param");
    expect(param?.count).toBe(2);
    expect(param?.classification).toBe("standard");
    expect(report.blockTagsToRegister).toEqual(["@since"]);
    expect(report.unknownTags).toEqual(["@foobar"]);
  });

  it("ignores tags inside fenced example code", () => {
    const comment = [
      "/**",
      " * Summary.",
      " * @example",
      " * ```ts",
      " * // @internal usage inside a fence",
      " * ```",
      " */",
    ].join("\n");

    const report = aggregateCommentTags([comment]);
    const tags = report.usages.map((usage) => usage.tag);
    expect(tags).toEqual(["@example"]);
  });
});

describe("collectProjectTags", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "jtt-tags-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "a.ts"),
      [
        "/**",
        " * Does a thing.",
        " * @since 1.0.0",
        " */",
        "export const a = 1;",
      ].join("\n"),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("aggregates tags across the project's source files", async () => {
    const report = await collectProjectTags(root);
    expect(report.blockTagsToRegister).toEqual(["@since"]);
  });
});
