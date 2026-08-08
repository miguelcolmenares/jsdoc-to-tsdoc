import { describe, expect, it } from "vitest";

import {
  convertCommitMessage,
  scaffoldCommitMessage,
} from "@/committer/messages";

describe("commit messages", () => {
  it("names the file in a Conventional-Commit docs: subject for convert", () => {
    expect(convertCommitMessage("src/lib/api.ts")).toBe(
      "docs: convert JSDoc to TSDoc in src/lib/api.ts",
    );
  });

  it("names the file in a Conventional-Commit docs: subject for scaffold", () => {
    expect(scaffoldCommitMessage("src/lib/api.ts")).toBe(
      "docs: add TSDoc stubs to src/lib/api.ts",
    );
  });
});
