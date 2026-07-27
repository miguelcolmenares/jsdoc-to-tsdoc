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

  it("skips re-export statements that name another module", () => {
    const source = [
      'export { Button } from "./button";',
      'export * from "./card";',
      'export type { Props } from "./types";',
    ].join("\n");

    expect(collectExportedDeclarations(source, "index.ts")).toHaveLength(0);
  });

  it("documents a local declaration exported through an export list", () => {
    const source = [
      "const foo = 1;",
      "function bar() {}",
      "export { foo, bar };",
    ].join("\n");

    const declarations = collectExportedDeclarations(source, "a.ts");
    expect(declarations.map((d) => d.name)).toEqual(["foo", "bar"]);
    // The stub belongs on the local declaration, not the export statement.
    expect(source.slice(declarations[0]?.insertPos ?? 0)).toMatch(/^const foo/);
  });

  it("resolves the local name behind an export alias", () => {
    const source = ["const local = 1;", "export { local as publicName };"].join(
      "\n",
    );
    expect(
      collectExportedDeclarations(source, "a.ts").map((d) => d.name),
    ).toEqual(["local"]);
  });

  it("documents a local declaration exported as default", () => {
    const source = ["function bar() {}", "export default bar;"].join("\n");
    expect(
      collectExportedDeclarations(source, "a.ts").map((d) => d.name),
    ).toEqual(["bar"]);
  });

  it("describes only the bindings an export list actually publishes", () => {
    // The statement also binds `A`, but the module publishes just `useHash`,
    // so the record must be named and classified after that binding.
    const source = [
      "const A = 1, useHash = () => '';",
      "export { useHash };",
    ].join("\n");

    const declarations = collectExportedDeclarations(source, "a.ts");
    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.name).toBe("useHash");
    expect(declarations[0]?.names).toEqual(["useHash"]);
    expect(declarations[0]?.kind).toBe("hook");
  });

  it("narrows a multi-binding statement to the exported subset", () => {
    const declarations = collectExportedDeclarations(
      "const A = 1, B = 2;\nexport { B };",
      "a.ts",
    );
    expect(declarations[0]?.name).toBe("B");
    expect(declarations[0]?.names).toEqual(["B"]);
  });

  it("narrows a destructuring statement to the exported subset", () => {
    const declarations = collectExportedDeclarations(
      "const { a, b } = src;\nexport { b };",
      "a.ts",
    );
    expect(declarations[0]?.name).toBe("b");
    expect(declarations[0]?.names).toEqual(["b"]);
  });

  it("keeps every name when the export list publishes them all", () => {
    const declarations = collectExportedDeclarations(
      "const A = 1, B = 2;\nexport { A, B };",
      "a.ts",
    );
    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.names).toEqual(["A", "B"]);
  });

  it("merges names published across separate export lists", () => {
    const declarations = collectExportedDeclarations(
      "const A = 1, B = 2;\nexport { A };\nexport { B };",
      "a.ts",
    );
    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.names).toEqual(["A", "B"]);
  });

  it("does not document an imported binding that is only re-exported", () => {
    const source = ['import { x } from "./x";', "export { x };"].join("\n");
    expect(collectExportedDeclarations(source, "a.ts")).toHaveLength(0);
  });

  it("never records the same declaration twice", () => {
    const source = ["export const foo = 1;", "export { foo };"].join("\n");
    expect(collectExportedDeclarations(source, "a.ts")).toHaveLength(1);
  });

  it("covers every binding of a multi-binding variable statement", () => {
    const source = "export const A = 1, B = 2;";
    const declarations = collectExportedDeclarations(source, "a.ts");

    // One comment position exists, so one record covers both names.
    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.names).toEqual(["A", "B"]);
  });

  it("covers a destructuring export instead of skipping it", () => {
    const source = "export const { a, b } = source;";
    const declarations = collectExportedDeclarations(source, "a.ts");

    expect(declarations).toHaveLength(1);
    expect(declarations[0]?.names).toEqual(["a", "b"]);
  });

  it("returns declarations in source order", () => {
    const source = [
      "const late = 1;",
      "export function first() {}",
      "export { late };",
    ].join("\n");

    const declarations = collectExportedDeclarations(source, "a.ts");
    expect(declarations.map((d) => d.name)).toEqual(["late", "first"]);
    expect(declarations[0]?.insertPos).toBeLessThan(
      declarations[1]?.insertPos ?? 0,
    );
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
    expect(
      declarations.find((d) => d.name === "documented")?.hasDocComment,
    ).toBe(true);
    expect(declarations.find((d) => d.name === "bare")?.hasDocComment).toBe(
      false,
    );
    expect(undocumentedDeclarations(declarations).map((d) => d.name)).toEqual([
      "bare",
    ]);
  });

  it("does not count a file header as documenting the first export", () => {
    // `tsdoc-require-2/require` still reports the export below a
    // `@packageDocumentation` header as undocumented, so counting the header
    // would make scaffold --check pass while lint failed.
    const source = [
      "/**",
      " * @packageDocumentation",
      " * Module header.",
      " */",
      "",
      "export function foo(): void {}",
    ].join("\n");

    expect(findByName(source, "a.ts", "foo").hasDocComment).toBe(false);
  });

  it("does not count a comment separated by a blank line", () => {
    const source = [
      "/** An unrelated note. */",
      "",
      "export function bar(): void {}",
    ].join("\n");

    expect(findByName(source, "a.ts", "bar").hasDocComment).toBe(false);
  });

  it("does not count a doc comment separated by another comment", () => {
    // The presence rule reports these as undocumented, so counting the doc
    // block would let scaffold --check pass while lint failed.
    const lineComment = [
      "/** Documented. */",
      "// eslint-disable-next-line no-console",
      "export function withLineComment(): void {}",
    ].join("\n");
    expect(
      findByName(lineComment, "a.ts", "withLineComment").hasDocComment,
    ).toBe(false);

    const blockComment = [
      "/** Documented. */",
      "/* plain block */",
      "export function withBlockComment(): void {}",
    ].join("\n");
    expect(
      findByName(blockComment, "a.ts", "withBlockComment").hasDocComment,
    ).toBe(false);
  });

  it("documents an anonymous default-exported function", () => {
    // There is no local declaration to hang the docs on, so the export
    // statement itself carries them.
    const arrow = "export default () => <div />;";
    const [component] = collectExportedDeclarations(arrow, "page.tsx");
    expect(component?.name).toBe("default");
    expect(component?.kind).toBe("react-component");

    const plain = "export default function () { return 1; }";
    expect(collectExportedDeclarations(plain, "a.ts")[0]?.kind).toBe(
      "function",
    );
  });

  it("leaves a non-function default export alone", () => {
    // `tsdoc-require-2/require` does not ask for a comment here, so neither
    // does scaffold.
    expect(
      collectExportedDeclarations("export default createStore();", "a.ts"),
    ).toHaveLength(0);
  });

  it("counts an adjacent header, matching where the presence rule draws the line", () => {
    // No blank line: the comment documents the declaration below it.
    const source = [
      "/**",
      " * @packageDocumentation",
      " */",
      "export function foo(): void {}",
    ].join("\n");

    expect(findByName(source, "a.ts", "foo").hasDocComment).toBe(true);
  });

  it("uses the nearest doc comment when several precede a declaration", () => {
    const source = [
      "/** First. */",
      "/** Second, adjacent. */",
      "export function baz(): void {}",
    ].join("\n");

    expect(findByName(source, "a.ts", "baz").hasDocComment).toBe(true);
  });

  it("does not treat a line comment as documentation", () => {
    const source = [
      "// Fetches the user.",
      "export function getUser() {}",
    ].join("\n");
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

  it("classifies a concise arrow component as a component", () => {
    // The common React idiom has an expression body, not a block, so the JSX
    // check has to walk the body in either form.
    const concise = "export const Hero = () => <div />;";
    expect(findByName(concise, "hero.tsx", "Hero").kind).toBe(
      "react-component",
    );

    const parenthesized = "export const Hero = () => (\n  <div />\n);";
    expect(findByName(parenthesized, "hero.tsx", "Hero").kind).toBe(
      "react-component",
    );

    const fragment = "export const Hero = () => <></>;";
    expect(findByName(fragment, "hero.tsx", "Hero").kind).toBe(
      "react-component",
    );
  });

  it("does not call a non-JSX arrow or a camelCase one a component", () => {
    const value = "export const Hero = () => 1;";
    expect(findByName(value, "a.tsx", "Hero").kind).toBe("function");

    // PascalCase is part of the convention, so a lowercase name stays a function.
    const lowercase = "export const helper = () => <div />;";
    expect(findByName(lowercase, "a.tsx", "helper").kind).toBe("function");
  });

  it("classifies a useX export as a hook, arrow or function", () => {
    const arrow = "export const useHash = (): string => { return ''; };";
    expect(findByName(arrow, "use-hash.ts", "useHash").kind).toBe("hook");

    const fn = "export function useMounted(): boolean { return true; }";
    expect(findByName(fn, "use-mounted.ts", "useMounted").kind).toBe("hook");
  });

  it("keeps the hook classification for a hook produced by a factory", () => {
    // The canonical store idiom binds `useX` to a factory call, not to a
    // function expression, and is a genuine hook.
    const factory = "export const useStore = create<State>()((set) => ({}));";
    expect(findByName(factory, "a.ts", "useStore").kind).toBe("hook");

    const alias = "export const useAuth = useAuthBase;";
    expect(findByName(alias, "a.ts", "useAuth").kind).toBe("hook");

    // Ambient declarations have no initializer but are still hooks.
    const ambient = "export declare const useTheme: () => string;";
    expect(findByName(ambient, "a.ts", "useTheme").kind).toBe("hook");
  });

  it("does not call a useX data export a hook", () => {
    // A `useX` name alone must not produce a "React hook ..." summary when the
    // value provably cannot be callable.
    for (const source of [
      "export const useDefaults = { a: 1 };",
      "export const useList = [1, 2];",
      "export const useMax = 42;",
      'export const useName = "x";',
    ]) {
      const [declaration] = collectExportedDeclarations(source, "a.ts");
      expect(declaration?.kind).toBe("variable");
    }
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
      { name: "value", isOptional: false, isSynthesized: false },
      { name: "fallback", isOptional: true, isSynthesized: false },
      { name: "extra", isOptional: true, isSynthesized: false },
    ]);
  });

  it("drops an explicit this annotation from the parameter list", () => {
    const source =
      "export function handle(this: HTMLElement, event: Event): void {}";

    const declaration = findByName(source, "handle.ts", "handle");
    expect(declaration.parameters).toEqual([
      { name: "event", isOptional: false, isSynthesized: false },
    ]);
  });

  it("numbers positional labels after dropping the this annotation", () => {
    // `this` occupies a parameter slot in the AST, so counting it would push the
    // first real parameter to index 1 and label it `arg1` instead of `options`.
    const source =
      "export function format(this: Formatter, { pretty }: Config): string { return ''; }";

    const declaration = findByName(source, "format.ts", "format");
    expect(declaration.parameters).toEqual([
      { name: "options", isOptional: false, isSynthesized: true },
    ]);
  });

  it("separates a signature that was never read from one declaring nothing", () => {
    const readable = findByName(
      "export function read(): string { return ''; }",
      "a.ts",
      "read",
    );
    expect(readable.hasSignature).toBe(true);
    expect(readable.parameters).toEqual([]);

    const unreadable = findByName(
      "export const useHash = createHook(defaults);",
      "a.ts",
      "useHash",
    );
    expect(unreadable.kind).toBe("hook");
    expect(unreadable.hasSignature).toBe(false);
    expect(unreadable.parameters).toEqual([]);
  });

  it("marks a destructured parameter's name as synthesized", () => {
    const source =
      "export function Card({ title, href }: CardProps) { return null; }";

    const declaration = findByName(source, "card.tsx", "Card");
    expect(declaration.parameters).toEqual([
      { name: "props", isOptional: false, isSynthesized: true },
    ]);
  });

  it("attaches a `//` prose run, stopping at a blank line", () => {
    const source = [
      "// Detached note.",
      "",
      "// Fetches the user by ID",
      "// and returns null when absent.",
      "export function getUser(id: string) { return id; }",
    ].join("\n");

    const declaration = findByName(source, "user.ts", "getUser");
    expect(declaration.hasDocComment).toBe(false);
    // The span covers the whole run and starts at the first `//`, not at the
    // detached note above it — promotion replaces exactly this range.
    expect(declaration.comment).toEqual({
      kind: "line",
      text: "// Fetches the user by ID\n// and returns null when absent.",
      line: 3,
      pos: source.indexOf("// Fetches"),
      end: source.indexOf("absent.") + "absent.".length,
    });
  });

  it("exposes the text of an attached doc comment", () => {
    const source = [
      "/** Adds. */",
      "export function add(a: number) { return a; }",
    ].join("\n");

    const declaration = findByName(source, "add.ts", "add");
    expect(declaration.comment).toEqual({
      kind: "doc",
      text: "/** Adds. */",
      line: 1,
      pos: 0,
      end: "/** Adds. */".length,
    });
  });

  it("reports a plain block comment as documenting nothing", () => {
    const source = ["/* Not TSDoc. */", "export const answer = 42;"].join("\n");

    const declaration = findByName(source, "answer.ts", "answer");
    expect(declaration.hasDocComment).toBe(false);
    expect(declaration.comment?.kind).toBe("block");
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

    expect(source.slice(declaration.insertPos)).toBe(
      "export function ship() {}",
    );
    expect(declaration.indent).toBe("");
    expect(declaration.line).toBe(3);
  });

  it("anchors at the declaration when another statement shares the line", () => {
    const source = "const a = 1; export const b = 2;";
    const declaration = findByName(source, "a.ts", "b");

    // Inserting at the line start would document `const a = 1;` instead. The
    // replaced span reaches back over the separating space so it is consumed
    // rather than left at the end of the previous line.
    expect(source.slice(declaration.insertEnd)).toBe("export const b = 2;");
    expect(source.slice(declaration.insertPos, declaration.insertEnd)).toBe(
      " ",
    );
    expect(declaration.indent).toBe("");
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
