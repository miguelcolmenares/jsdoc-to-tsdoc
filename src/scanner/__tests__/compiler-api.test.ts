import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  checkCompilerApi,
  REQUIRED_ENUMS,
  REQUIRED_FUNCTIONS,
} from "@/scanner/compiler-api";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

// `ts.X` references that erase at compile time. A type never reaches the
// runtime module, so checking for it would fail against a perfectly good
// TypeScript. Every name here was confirmed to be type-only; a new one has to
// be added deliberately, which is the point.
const TYPE_ONLY = new Set([
  "BindingName",
  "DeclarationWithTypeParameterChildren",
  "ExportAssignment",
  "Expression",
  "FunctionTypeNode",
  "MethodSignature",
  "Node",
  "NodeArray",
  "ParameterDeclaration",
  "PropertyName",
  "SignatureDeclaration",
  "SourceFile",
  "Statement",
  "TypeElement",
]);

/** Every `.ts` file under `src/`, excluding tests. */
async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      found.push(...(await sourceFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Removes comments so prose describing the API is not read as a call.
 *
 * This module's own TSDoc says "the `ts.isX` type guards", which a raw scan
 * reports as a missing member called `isX`.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Every distinct `ts.<member>` the non-test source references. */
async function referencedMembers(): Promise<Set<string>> {
  const members = new Set<string>();
  for (const file of await sourceFiles(SRC)) {
    const text = stripComments(await readFile(file, "utf8"));
    for (const match of text.matchAll(/\bts\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      members.add(match[1] as string);
    }
  }
  return members;
}

/** A module satisfying every requirement, for tests that break one member. */
function complete(): Record<string, unknown> {
  return Object.fromEntries([
    ...REQUIRED_FUNCTIONS.map((name) => [name, () => undefined]),
    ...REQUIRED_ENUMS.map((name) => [name, {}]),
  ]) as Record<string, unknown>;
}

describe("checkCompilerApi", () => {
  it("accepts the real TypeScript this package depends on", () => {
    expect(checkCompilerApi(ts as unknown as Record<string, unknown>)).toEqual({
      ok: true,
    });
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
    // A module complete but for three members, so nothing is truncated away.
    const api = complete();
    delete api.createSourceFile;
    delete api.ScriptKind;
    delete api.SyntaxKind;

    const result = checkCompilerApi(api);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("createSourceFile");
    expect(result.reason).toContain("ScriptKind");
    expect(result.reason).toContain("SyntaxKind");
    expect(result.reason).not.toMatch(/more/);
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
    const api = complete();
    api.ScriptKind = null;
    api.SyntaxKind = "TS";

    const result = checkCompilerApi(api);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("ScriptKind");
    expect(result.reason).toContain("SyntaxKind");
    expect(result.reason).not.toContain("createSourceFile");
  });
});

describe("the guard's coverage of what the scanner actually uses", () => {
  // Copilot caught this on #76: the first version checked createSourceFile,
  // ScriptKind and SyntaxKind, while the scanner also calls
  // getLeadingCommentRanges and twenty-odd type guards. A partial shim would
  // have passed the guard and crashed exactly as before. Sampling the API was
  // the bug; this test is what stops it recurring, since the obvious next
  // failure is someone adding a `ts.isFoo()` call and not the guard entry.
  it("checks every runtime ts.* member the source references", async () => {
    const referenced = await referencedMembers();
    const checked = new Set([...REQUIRED_FUNCTIONS, ...REQUIRED_ENUMS]);

    const unclassified = [...referenced].filter(
      (name) => !checked.has(name) && !TYPE_ONLY.has(name),
    );

    expect(unclassified).toEqual([]);
  });

  // The reverse direction: a member dropped from the source but left in the
  // guard makes the check stricter than the tool, which would reject a
  // TypeScript that would have worked fine.
  it("checks nothing the source has stopped using", async () => {
    const referenced = await referencedMembers();

    const stale = [...REQUIRED_FUNCTIONS, ...REQUIRED_ENUMS].filter(
      (name) => !referenced.has(name),
    );

    expect(stale).toEqual([]);
  });

  it("classifies no member as both type-only and required", () => {
    const both = [...REQUIRED_FUNCTIONS, ...REQUIRED_ENUMS].filter((name) =>
      TYPE_ONLY.has(name),
    );

    expect(both).toEqual([]);
  });

  // A real TypeScript must satisfy the widened list, or the guard would reject
  // the very version this package depends on.
  it("still accepts the real TypeScript after widening", () => {
    expect(checkCompilerApi(ts as unknown as Record<string, unknown>)).toEqual({
      ok: true,
    });
  });

  it("names getLeadingCommentRanges when it is the only thing missing", () => {
    const api = complete();
    delete api.getLeadingCommentRanges;

    const result = checkCompilerApi(api);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("getLeadingCommentRanges");
  });

  // Thirty names in one sentence is not a diagnostic.
  it("summarises rather than listing every member of an empty module", () => {
    const result = checkCompilerApi({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/and \d+ more/);
  });
});
