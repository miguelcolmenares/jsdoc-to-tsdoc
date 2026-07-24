import { describe, expect, it } from "vitest";

import { mapCommentLines } from "@/parser/comment-lines";

const identity = (content: string): string => content;

describe("mapCommentLines", () => {
  it("returns a structurally identical comment under the identity mapper", () => {
    const comment = [
      "/**",
      " * Summary.",
      " *",
      " * @param name - The name.",
      " */",
    ].join("\n");

    expect(mapCommentLines(comment, identity)).toBe(comment);
  });

  it("exposes content without the leading ` * ` prefix", () => {
    const comment = ["/**", " * @async", " */"].join("\n");
    const seen: string[] = [];

    mapCommentLines(comment, (content) => {
      seen.push(content);
      return content;
    });

    expect(seen).toContain("@async");
  });

  it("drops interior lines when the mapper returns null", () => {
    const comment = [
      "/**",
      " * Summary.",
      " * @async",
      " * @param x - value",
      " */",
    ].join("\n");

    const result = mapCommentLines(comment, (content) =>
      content.trim() === "@async" ? null : content,
    );

    expect(result).toBe(
      ["/**", " * Summary.", " * @param x - value", " */"].join("\n"),
    );
  });

  it("does not drop the opening line even when it maps to null", () => {
    const comment = ["/** @typedef Foo", " * more", " */"].join("\n");
    const result = mapCommentLines(comment, (content) =>
      content.startsWith("@typedef") ? null : content,
    );

    expect(result.startsWith("/**")).toBe(true);
    expect(result).not.toContain("@typedef");
  });

  it("marks fenced code lines and their delimiters as inFence", () => {
    const comment = [
      "/**",
      " * @example",
      " * ```typescript",
      " * fn({ a: 1 });",
      " * ```",
      " */",
    ].join("\n");

    const fenceStates: boolean[] = [];
    mapCommentLines(comment, (content, context) => {
      fenceStates.push(context.inFence);
      return content;
    });

    // Content lines: "" (opening), "@example", "```typescript",
    // "fn({ a: 1 });", "```" — the opening line carries empty content.
    expect(fenceStates).toEqual([false, false, true, true, true]);
  });

  it("preserves CRLF line endings", () => {
    const comment = ["/**", " * Summary.", " */"].join("\r\n");
    expect(mapCommentLines(comment, identity)).toBe(comment);
  });

  it("handles single-line comments", () => {
    const comment = "/** @return {string} the value */";
    const result = mapCommentLines(comment, (content) =>
      content.replace("@return ", "@returns "),
    );
    expect(result).toBe("/** @returns {string} the value */");
  });

  it("maps content on a closing line that carries text", () => {
    const comment = ["/**", " * @param x - value */"].join("\n");
    const result = mapCommentLines(comment, (content) =>
      content.replace("value", "VALUE"),
    );
    expect(result).toBe(["/**", " * @param x - VALUE */"].join("\n"));
  });

  it("captures extra alignment whitespace into the prefix", () => {
    const comment = ["/**", " *   @param name", " */"].join("\n");
    const seen: string[] = [];
    const result = mapCommentLines(comment, (content) => {
      seen.push(content);
      return content.startsWith("@param") ? content.toUpperCase() : content;
    });

    // Content begins at the tag despite the extra alignment spaces...
    expect(seen).toContain("@param name");
    // ...and the exact alignment is preserved on output.
    expect(result).toBe(["/**", " *   @PARAM NAME", " */"].join("\n"));
  });

  it("expands an array return into multiple lines sharing the prefix", () => {
    const comment = ["/**", " * @fileoverview Hello", " */"].join("\n");
    const result = mapCommentLines(comment, (content) =>
      content.startsWith("@fileoverview")
        ? ["@packageDocumentation", "Hello"]
        : content,
    );
    expect(result).toBe(
      ["/**", " * @packageDocumentation", " * Hello", " */"].join("\n"),
    );
  });
});
