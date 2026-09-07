import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { checkCompilerApi } from "@/scanner/compiler-api";

describe("checkCompilerApi", () => {
  it("accepts the real TypeScript this package depends on", () => {
    expect(checkCompilerApi(ts)).toEqual({ ok: true });
  });

  // The regression this pins is issue #67: TypeScript 7's npm package resolves
  // `"."` to lib/version.cjs, so it imports cleanly and then has no Compiler
  // API. Before the check, that surfaced as
  // `Cannot read properties of undefined (reading 'TSX')`.
  it("rejects the TypeScript 7 package shape and names the cause", () => {
    const result = checkCompilerApi({ version: "7.0.2" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("createSourceFile");
    expect(result.reason).toContain("7.0.2");
    expect(result.reason).toContain("native rewrite");
    expect(result.reason).toContain(">=5.0.0 <7.0.0");
  });

  it("names every missing member, not just the first", () => {
    const result = checkCompilerApi({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("createSourceFile");
    expect(result.reason).toContain("ScriptKind");
    expect(result.reason).toContain("SyntaxKind");
  });

  it("omits the version when the module does not report one", () => {
    const result = checkCompilerApi({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toContain("(found");
    expect(result.reason).toContain(">=5.0.0 <7.0.0");
  });

  // A pre-7 package missing the API is a broken install or a bundler shim, not
  // the native rewrite — saying "TypeScript 7 is the native rewrite" there
  // would send someone chasing a version they are not running.
  it("does not blame the native rewrite for a pre-7 version", () => {
    const result = checkCompilerApi({ version: "5.4.5" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("5.4.5");
    expect(result.reason).not.toContain("native rewrite");
  });

  // ScriptKind and SyntaxKind are enums, so `typeof` alone would accept a
  // function or a string standing in for one.
  it("rejects a module whose enums are not objects", () => {
    const result = checkCompilerApi({
      createSourceFile: () => undefined,
      ScriptKind: null,
      SyntaxKind: "TS",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("ScriptKind");
    expect(result.reason).toContain("SyntaxKind");
    expect(result.reason).not.toContain("createSourceFile");
  });
});
