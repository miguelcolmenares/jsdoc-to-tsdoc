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

describe("tooling pragmas in block comments", () => {
  // #75: `@jest-environment node` is how Jest selects the test environment for
  // a file. It was reported as an unknown tag called `@jest` — truncated at the
  // hyphen, so the name did not even appear in the source — and both actions
  // the message offers break something: registering it declares a
  // documentation tag that is not one, removing it silently changes which
  // environment the test runs in.
  it("does not ask the user to register or remove @jest-environment", () => {
    const report = aggregateCommentTags([
      "/**\n * @jest-environment node\n */",
    ]);

    expect(report.unknownTags).toEqual([]);
    expect(report.blockTagsToRegister).toEqual([]);
  });

  it("reports the pragma by its real name, not truncated at the hyphen", () => {
    const report = aggregateCommentTags([
      "/**\n * @jest-environment node\n */",
    ]);

    expect(report.usages).toEqual([
      { tag: "@jest-environment", count: 1, classification: "pragma" },
    ]);
  });

  it("classifies the other common pragmas the same way", () => {
    const report = aggregateCommentTags([
      "/**\n * @vitest-environment happy-dom\n */",
      "/**\n * @ts-check\n */",
    ]);

    expect(report.unknownTags).toEqual([]);
    expect(report.usages.map((u) => u.classification)).toEqual([
      "pragma",
      "pragma",
    ]);
  });

  // A genuinely unknown tag must still be reported: the fix is about pragmas,
  // not about silencing the prompt.
  it("still reports a hyphen-free unknown tag", () => {
    const report = aggregateCommentTags(["/**\n * @invented\n */"]);

    expect(report.unknownTags).toEqual(["@invented"]);
  });
});
