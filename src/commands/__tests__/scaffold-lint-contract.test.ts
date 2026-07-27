import { ESLint } from "eslint";
import tsdoc from "eslint-plugin-tsdoc";
import tsdocRequire from "eslint-plugin-tsdoc-require-2";
import tseslint from "typescript-eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { scaffoldSourceText } from "@/commands/scaffold-file";

/**
 * The promise `scaffold` makes: after it runs, no export in the file is still
 * reported as undocumented, and every stub it wrote is valid TSDoc.
 *
 * These are the exact rules `init` installs into a consumer project, so this
 * suite checks the contract against the real linter rather than against our own
 * idea of what the linter wants. Every false pass found during review — a
 * `@packageDocumentation` header counted as documentation, an export list left
 * unresolved, an anonymous default export skipped — would have failed here.
 */
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        // A fixture carries an `eslint-disable` line to prove such a comment
        // detaches a doc block. Only the TSDoc rules are enabled here, so that
        // directive is unused by construction and must not be reported.
        linterOptions: { reportUnusedDisableDirectives: "off" },
        plugins: { tsdoc, "tsdoc-require-2": tsdocRequire },
        rules: {
          "tsdoc/syntax": "error",
          "tsdoc-require-2/require": "error",
          // Mirrors the defaults `init` writes: these two false-positive on
          // interfaces, type aliases and constants.
          "tsdoc-require-2/require-param": "off",
          "tsdoc-require-2/require-returns": "off",
        },
      },
    ],
  });
});

async function lint(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map(
    (message) =>
      `${message.ruleId ?? "?"} (line ${String(message.line)}): ${message.message}`,
  );
}

/** Every export form the inventory claims to handle. */
const fixtures: ReadonlyArray<
  readonly [name: string, file: string, source: string]
> = [
  [
    "plain function",
    "a.ts",
    "export function plain(a: string): string { return a; }",
  ],
  ["void function", "a.ts", "export function log(message: string): void {}"],
  [
    "async function",
    "a.ts",
    "export async function load(id: string) { return id; }",
  ],
  [
    "generic function",
    "a.ts",
    "export function identity<T>(value: T): T { return value; }",
  ],
  ["interface", "a.ts", "export interface Config { endpoint: string }"],
  ["type alias", "a.ts", 'export type Status = "new" | "won";'],
  ["class", "a.ts", "export class Client {}"],
  ["enum", "a.ts", "export enum Level { Low }"],
  ["constant", "a.ts", "export const MAX = 1;"],
  ["multi-binding constant", "a.ts", "export const A = 1, B = 2;"],
  ["destructuring export", "a.ts", "export const { a, b } = source;"],
  [
    "arrow function",
    "a.ts",
    "export const toText = (v: number): string => String(v);",
  ],
  ["hook, arrow", "a.ts", "export const useHash = (): string => '';"],
  ["hook, factory", "a.ts", "export const useStore = create<S>()(() => ({}));"],
  ["hook, data export", "a.ts", "export const useDefaults = { a: 1 };"],
  [
    "server action",
    "actions.ts",
    "export async function submitForm(prevState: S, formData: FormData) { return prevState; }",
  ],
  [
    "component, block body",
    "hero.tsx",
    "export default function Hero({ title }: HeroProps) { return <h1>{title}</h1>; }",
  ],
  [
    "component, concise arrow",
    "hero.tsx",
    "export const Hero = () => <div />;",
  ],
  ["component, fragment", "hero.tsx", "export const Hero = () => <></>;"],
  [
    "export list over locals",
    "a.ts",
    "const alpha = 1;\nfunction beta() {}\nexport { alpha, beta };",
  ],
  [
    "export list with alias",
    "a.ts",
    "const local = 1;\nexport { local as publicName };",
  ],
  [
    "export list, subset of a multi-binding statement",
    "a.ts",
    "const A = 1, useHash = () => '';\nexport { useHash };",
  ],
  [
    "default export of a local",
    "a.ts",
    "function beta() {}\nexport default beta;",
  ],
  [
    "anonymous default function",
    "a.ts",
    "export default function () { return 1; }",
  ],
  ["anonymous default arrow", "page.tsx", "export default () => <div />;"],
  [
    "overload set",
    "a.ts",
    [
      "export function f(a: string): string;",
      "export function f(a: number): string;",
      "export function f(a: unknown): string { return String(a); }",
    ].join("\n"),
  ],
  [
    "overload set exported through an export list",
    "a.ts",
    [
      "function f(a: string): string;",
      "function f(a: number): string;",
      "function f(a: unknown): string { return String(a); }",
      "export { f };",
    ].join("\n"),
  ],
  [
    "declaration merging exported through an export list",
    "a.ts",
    [
      "interface Shape { kind: string }",
      "function Shape() { return { kind: 'x' }; }",
      "export { Shape };",
    ].join("\n"),
  ],
  [
    "export under a packageDocumentation header",
    "a.ts",
    "/**\n * @packageDocumentation\n * Header.\n */\n\nexport function foo(): void {}",
  ],
  [
    "export under a detached comment",
    "a.ts",
    "/** Unrelated note. */\n\nexport function bar(): void {}",
  ],
  [
    "export behind an eslint-disable line",
    "a.ts",
    "/** Documented. */\n// eslint-disable-next-line no-console\nexport function baz(): void {}",
  ],
  ["declaration sharing a line", "a.ts", "const a = 1; export const b = 2;"],
  [
    "indented declaration sharing a line",
    "a.ts",
    "  const a = 1; export const b = 2;",
  ],
  [
    "mixed file",
    "mixed.tsx",
    [
      "/**",
      " * @packageDocumentation",
      " * Header.",
      " */",
      "",
      "export interface HeroProps { title: string }",
      "export const Hero = () => <div />;",
      "export const useStore = create<S>()(() => ({}));",
      "const helper = 1;",
      "export { helper };",
      "export default () => <span />;",
    ].join("\n"),
  ],
];

describe("scaffold satisfies the rules init installs", () => {
  it.each(fixtures)("%s", async (_name, file, source) => {
    const { output } = scaffoldSourceText(source, file);
    const messages = await lint(output, file);

    expect(messages).toEqual([]);
  });

  it.each(fixtures)("%s is idempotent", (_name, file, source) => {
    const first = scaffoldSourceText(source, file);
    expect(scaffoldSourceText(first.output, file).changed).toBe(false);
  });

  it.each(fixtures)(
    "%s introduces no trailing whitespace",
    (_name, file, source) => {
      // Scaffolding must preserve formatting. Stranded spaces at the end of a
      // line are flagged by formatters and whitespace rules, which would hand the
      // user cleanup work the tool was supposed to save.
      const sourceOffenders = source
        .split("\n")
        .filter((line) => /[ \t]+$/.test(line)).length;

      const { output } = scaffoldSourceText(source, file);
      const outputOffenders = output
        .split("\n")
        .filter((line) => /[ \t]+$/.test(line));

      expect(outputOffenders).toHaveLength(sourceOffenders);
    },
  );

  it("leaves an already-documented file untouched and passing", async () => {
    const source = [
      "/**",
      " * Adds two numbers.",
      " *",
      " * @param a - The first addend.",
      " * @returns The sum.",
      " */",
      "export function add(a: number, b: number): number { return a + b; }",
    ].join("\n");

    const { output, changed } = scaffoldSourceText(source, "a.ts");
    expect(changed).toBe(false);
    expect(await lint(output, "a.ts")).toEqual([]);
  });
});
