import { describe, expect, it } from "vitest";

import {
  collectExportedDeclarations,
  undocumentedDeclarations,
} from "@/scanner/export-inventory";

const findByName = (
  source: string,
  fileName: string,
  name: string,
): ReturnType<typeof collectExportedDeclarations>[number] => {
  const found = collectExportedDeclarations(source, fileName).find(
    (declaration) => declaration.name === name,
  );
  if (!found) {
    throw new Error(`expected an export named ${name}`);
  }
  return found;
};

describe("collectExportedDeclarations", () => {
  it("ignores declarations that are not exported", () => {
    const source = [
      "function helper() {}",
      "const value = 1;",
      "export function shipped() {}",
    ].join("\n");

    const declarations = collectExportedDeclarations(source, "a.ts");
    expect(declarations.map((declaration) => declaration.name)).toEqual([
      "shipped",
    ]);
  });

  it("skips re-export statements", () => {
    const source = [
      'export { Button } from "./button";',
      'export * from "./card";',
      'export type { Props } from "./types";',
    ].join("\n");

    expect(collectExportedDeclarations(source, "index.ts")).toHaveLength(0);
  });

  it("detects an existing doc comment", () => {
    const source = [
      "/**",
      " * Documented.",
      " */",
      "export function documented() {}",
      "",
      "export function bare() {}",
    ].join("\n");

    const declarations = collectExportedDeclarations(source, "a.ts");
    expect(declarations.find((d) => d.name === "documented")?.hasDocComment).toBe(
      true,
    );
    expect(declarations.find((d) => d.name === "bare")?.hasDocComment).toBe(
      false,
    );
    expect(undocumentedDeclarations(declarations).map((d) => d.name)).toEqual([
      "bare",
    ]);
  });

  it("does not treat a line comment as documentation", () => {
    const source = ["// Fetches the user.", "export function getUser() {}"].join(
      "\n",
    );
    expect(findByName(source, "a.ts", "getUser").hasDocComment).toBe(false);
  });

  it("classifies a Server Action by its (prevState, formData) signature", () => {
    const source = [
      "export async function submitForm(prevState: State, formData: FormData) {",
      "  return prevState;",
      "}",
    ].join("\n");

    const declaration = findByName(source, "actions.ts", "submitForm");
    expect(declaration.kind).toBe("server-action");
    expect(declaration.parameters.map((p) => p.name)).toEqual([
      "prevState",
      "formData",
    ]);
  });

  it("classifies a PascalCase function returning JSX as a component", () => {
    const source = [
      "export default function HeroSection({ title }: HeroSectionProps) {",
      "  return <section>{title}</section>;",
      "}",
    ].join("\n");

    const declaration = findByName(source, "hero.tsx", "HeroSection");
    expect(declaration.kind).toBe("react-component");
    // A destructured `Props`-typed binding is documented as `props`.
    expect(declaration.parameters.map((p) => p.name)).toEqual(["props"]);
  });

  it("classifies a useX export as a hook, arrow or function", () => {
    const arrow = "export const useHash = (): string => { return ''; };";
    expect(findByName(arrow, "use-hash.ts", "useHash").kind).toBe("hook");

    const fn = "export function useMounted(): boolean { return true; }";
    expect(findByName(fn, "use-mounted.ts", "useMounted").kind).toBe("hook");
  });

  it("classifies interfaces, type aliases, classes, enums and constants", () => {
    const source = [
      "export interface Config { endpoint: string }",
      'export type Status = "new" | "won";',
      "export class Client {}",
      "export enum Level { Low }",
      "export const MAX_RETRIES = 3;",
    ].join("\n");

    const byName = new Map(
      collectExportedDeclarations(source, "a.ts").map((d) => [d.name, d.kind]),
    );
    expect(byName.get("Config")).toBe("interface");
    expect(byName.get("Status")).toBe("type-alias");
    expect(byName.get("Client")).toBe("class");
    expect(byName.get("Level")).toBe("enum");
    expect(byName.get("MAX_RETRIES")).toBe("variable");
  });

  it("captures type parameters and optional parameters", () => {
    const source =
      "export function pick<T, K>(value: T, fallback?: K, extra = 1): T { return value; }";

    const declaration = findByName(source, "pick.ts", "pick");
    expect(declaration.typeParameters).toEqual(["T", "K"]);
    expect(declaration.parameters).toEqual([
      { name: "value", isOptional: false },
      { name: "fallback", isOptional: true },
      { name: "extra", isOptional: true },
    ]);
  });

  it("reports no return value for void and Promise<void> signatures", () => {
    const voidFn = "export function log(message: string): void {}";
    expect(findByName(voidFn, "a.ts", "log").hasReturnValue).toBe(false);

    const asyncVoid =
      "export async function flush(): Promise<void> { return; }";
    expect(findByName(asyncVoid, "a.ts", "flush").hasReturnValue).toBe(false);

    const returning = "export function sum(a: number): number { return a; }";
    expect(findByName(returning, "a.ts", "sum").hasReturnValue).toBe(true);
  });

  it("records the insertion point at the start of the declaration line", () => {
    const source = ["const x = 1;", "", "export function ship() {}"].join("\n");
    const declaration = findByName(source, "a.ts", "ship");

    expect(source.slice(declaration.insertPos)).toBe("export function ship() {}");
    expect(declaration.indent).toBe("");
    expect(declaration.line).toBe(3);
  });

  it("preserves the declaration's indentation for the stub", () => {
    // A declaration is indented when it sits inside a namespace-style wrapper;
    // the recorded indent is what the stub must be rendered with.
    const source = "  export function nested() {}";
    const declaration = findByName(source, "a.ts", "nested");
    expect(declaration.indent).toBe("  ");
    expect(declaration.insertPos).toBe(0);
  });

  it("ignores the word export inside a string literal", () => {
    const source = [
      'const sql = "export function fake() {}";',
      "export const real = 1;",
    ].join("\n");

    expect(
      collectExportedDeclarations(source, "a.ts").map((d) => d.name),
    ).toEqual(["real"]);
  });
});
