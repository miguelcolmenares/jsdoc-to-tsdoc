/**
 * Verifies that the resolved `typescript` package exposes the classic
 * Compiler API this tool is built on.
 *
 * @remarks
 * Every scanner module reads source through `ts.createSourceFile` and the
 * `ts.ScriptKind` / `ts.SyntaxKind` enums. Two situations produce a package
 * that imports cleanly and then fails on first use:
 *
 * - **TypeScript 7.** Its npm package is restructured around the native/Go
 *   rewrite and its `"."` export resolves to `lib/version.cjs`, which carries
 *   none of the Compiler API. Symptom before this check existed:
 *   `Cannot read properties of undefined (reading 'TSX')`, several stack
 *   frames deep in a command, with nothing naming TypeScript as the cause.
 * - **A stub or shimmed module** substituted by a bundler or a monorepo alias.
 *
 * Both are cheap to detect once, at startup, and impossible to diagnose from
 * the error they otherwise produce.
 *
 * @since 0.2.2
 */

/**
 * The outcome of the startup Compiler API check.
 */
export type CompilerApiCheck =
  | { readonly ok: true }
  | {
      /** The API is unusable; `reason` is written for a human to act on. */
      readonly ok: false;
      /** What is wrong, phrased as a full sentence. */
      readonly reason: string;
    };

/**
 * The subset of the TypeScript module this tool cannot run without.
 *
 * @remarks
 * Structural rather than `typeof import("typescript")`, so a test can pass a
 * deliberately broken shape without constructing an entire compiler module.
 */
interface CompilerApiShape {
  readonly createSourceFile?: unknown;
  readonly ScriptKind?: unknown;
  readonly SyntaxKind?: unknown;
  readonly version?: unknown;
}

/**
 * Checks that a resolved `typescript` module carries the classic Compiler API.
 *
 * @param api - The imported `typescript` namespace. Injectable so the failure
 *              modes can be tested without installing a broken TypeScript.
 * @returns `{ ok: true }` when every required member is present, otherwise the
 *          reason, naming the resolved version when the package reports one.
 */
export function checkCompilerApi(api: CompilerApiShape): CompilerApiCheck {
  const missing: string[] = [];
  if (typeof api.createSourceFile !== "function") {
    missing.push("createSourceFile");
  }
  if (typeof api.ScriptKind !== "object" || api.ScriptKind === null) {
    missing.push("ScriptKind");
  }
  if (typeof api.SyntaxKind !== "object" || api.SyntaxKind === null) {
    missing.push("SyntaxKind");
  }

  if (missing.length === 0) {
    return { ok: true };
  }

  const version = typeof api.version === "string" ? api.version : undefined;
  const found = version === undefined ? "" : ` (found ${version})`;
  const major =
    version === undefined ? undefined : Number(version.split(".")[0]);
  const hint =
    major !== undefined && major >= 7
      ? " TypeScript 7 is the native rewrite and does not ship the classic Compiler API; this tool needs >=5.0.0 <7.0.0."
      : " Expected a standard `typescript` package in the range >=5.0.0 <7.0.0.";

  return {
    ok: false,
    reason: `The resolved \`typescript\` package is missing ${missing.join(", ")}${found}.${hint}`,
  };
}
