/**
 * Verifies that the resolved `typescript` package exposes the classic
 * Compiler API this tool is built on.
 *
 * @remarks
 * Every scanner module reads source through `ts.createSourceFile`, walks it
 * with the `ts.isX` type guards, and reads the `ts.ScriptKind` /
 * `ts.ScriptTarget` / `ts.SyntaxKind` enums. Two situations produce a package
 * that imports cleanly and then fails on first use:
 *
 * - **TypeScript 7.** Its npm package is restructured around the native/Go
 *   rewrite and its `"."` export resolves to `lib/version.cjs`, which carries
 *   none of the Compiler API. Symptom before this check existed:
 *   `Cannot read properties of undefined (reading 'TSX')`, several stack
 *   frames deep in a command, with nothing naming TypeScript as the cause.
 * - **A stub or shimmed module** substituted by a bundler or a monorepo alias.
 *   Unlike TypeScript 7, a shim can be *partial* — which is why the check
 *   covers everything the scanner calls rather than a sample of it.
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
 * Enum objects the scanner reads members off.
 *
 * @remarks
 * Kept in sync with the `ts.*` references in `src/` by
 * `compiler-api.test.ts`, which fails when a new one appears unclassified.
 */
export const REQUIRED_ENUMS: readonly string[] = Object.freeze([
  "ScriptKind",
  "ScriptTarget",
  "SyntaxKind",
]);

/**
 * Functions the scanner calls.
 *
 * @remarks
 * The full set, not a representative sample. A partial shim is a real failure
 * mode, and a guard that checks three entry points would pass one and then
 * crash exactly as before — which is the whole reason this module exists.
 * Kept in sync with `src/` by `compiler-api.test.ts`.
 */
export const REQUIRED_FUNCTIONS: readonly string[] = Object.freeze([
  "canHaveModifiers",
  "createSourceFile",
  "getLeadingCommentRanges",
  "getModifiers",
  "isArrayLiteralExpression",
  "isArrowFunction",
  "isBigIntLiteral",
  "isBindingElement",
  "isClassDeclaration",
  "isComputedPropertyName",
  "isEnumDeclaration",
  "isExportAssignment",
  "isExportDeclaration",
  "isFunctionDeclaration",
  "isFunctionExpression",
  "isFunctionTypeNode",
  "isIdentifier",
  "isInterfaceDeclaration",
  "isJsxElement",
  "isJsxFragment",
  "isJsxSelfClosingElement",
  "isMethodSignature",
  "isNamedExports",
  "isNoSubstitutionTemplateLiteral",
  "isNumericLiteral",
  "isObjectLiteralExpression",
  "isPropertySignature",
  "isRegularExpressionLiteral",
  "isStringLiteral",
  "isTemplateExpression",
  "isTypeAliasDeclaration",
  "isTypeLiteralNode",
  "isVariableStatement",
]);

/** How many missing members the message names before summarising the rest. */
const MAX_NAMED = 5;

/**
 * The shape of the TypeScript module this check inspects.
 *
 * @remarks
 * An index signature rather than `typeof import("typescript")`, so a test can
 * pass a deliberately broken module without constructing an entire compiler.
 */
type CompilerApiShape = Readonly<Record<string, unknown>>;

/**
 * Renders the missing members, capping the list so a wholly empty module does
 * not print thirty names.
 *
 * @param missing - Member names that failed their check.
 * @returns A comma-separated list, with a count when it was truncated.
 */
function summarise(missing: readonly string[]): string {
  if (missing.length <= MAX_NAMED) {
    return missing.join(", ");
  }
  const shown = missing.slice(0, MAX_NAMED).join(", ");
  return `${shown} and ${String(missing.length - MAX_NAMED)} more`;
}

/**
 * Checks that a resolved `typescript` module carries the classic Compiler API.
 *
 * @param api - The imported `typescript` namespace. Injectable so the failure
 *              modes can be tested without installing a broken TypeScript.
 * @returns `{ ok: true }` when every member the scanner calls is present,
 *          otherwise the reason, naming the resolved version when the package
 *          reports one.
 */
export function checkCompilerApi(api: CompilerApiShape): CompilerApiCheck {
  const missing = [
    ...REQUIRED_FUNCTIONS.filter((name) => typeof api[name] !== "function"),
    ...REQUIRED_ENUMS.filter(
      (name) => typeof api[name] !== "object" || api[name] === null,
    ),
  ];

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
    reason: `The resolved \`typescript\` package is missing ${summarise(missing)}${found}.${hint}`,
  };
}
