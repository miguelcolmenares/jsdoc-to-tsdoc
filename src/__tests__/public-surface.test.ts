import { describe, expect, it } from "vitest";

import * as api from "@/index";

// The programmatic entry point is the package's contract with library
// consumers, and nothing else enforces it: a new domain can ship with a barrel,
// tests and docs while staying unreachable from the package root. That is how
// `classifier` shipped in this very PR. Pinning the names turns "forgot to wire
// the domain up" into a failing test instead of a review comment.
const PUBLIC_SURFACE = [
  "PRESENCE_RULE_ID",
  "RULES",
  "TODO_MARKER",
  "TOPOLOGIES",
  "VERSION",
  "aggregateCommentTags",
  "buildStub",
  "checkSourceText",
  "classifyDeclaration",
  "classifyFile",
  "collectExportedDeclarations",
  "collectMemberTargets",
  "collectProjectTags",
  "confidenceOf",
  "convertSourceText",
  "createTsdocValidator",
  "detectProject",
  "extractJsDocComments",
  "findSourceFiles",
  "generateTsdocJson",
  "getBlockTags",
  "hasTypeBraces",
  "inferComponentSummary",
  "inferFunctionSummary",
  "inferHookSummary",
  "inferNounSummary",
  "installCommand",
  "mapCommentLines",
  "mergeTsdocJson",
  "missingPackages",
  "patchEslintFlatConfig",
  "readPropertyTags",
  "runPipeline",
  "runPreflight",
  "scaffoldSourceText",
  "undocumentedDeclarations",
  "updateRuleSeverity",
];

describe("programmatic entry point", () => {
  it("exports exactly the documented public surface", () => {
    expect(Object.keys(api).sort()).toEqual([...PUBLIC_SURFACE].sort());
  });

  it("reaches the classifier domain from the package root", () => {
    // The regression this pins: `classifier` had a barrel and a command using
    // it, but no path from the package root.
    const classification = api.classifyFile([]);
    expect(classification).toBeUndefined();
    expect(api.TOPOLOGIES).toContain("stale");
  });
});
