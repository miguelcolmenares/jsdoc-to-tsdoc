import { describe, expect, it } from "vitest";

import { classifyDeclaration, confidenceOf } from "@/classifier/topology";
import { collectExportedDeclarations } from "@/scanner";

/** Classifies the named export of a source snippet. */
const classify = (source: string, name: string, fileName = "a.ts") => {
  const declaration = collectExportedDeclarations(source, fileName).find(
    (candidate) => candidate.name === name,
  );
  if (declaration === undefined) {
    throw new Error(`no export named ${name}`);
  }
  return classifyDeclaration(declaration);
};

describe("classifyDeclaration", () => {
  it("reports a complete comment as valid", () => {
    const source = [
      "/**",
      " * Adds two numbers.",
      " *",
      " * @param a - First addend.",
      " * @param b - Second addend.",
      " * @returns The sum.",
      " */",
      "export function add(a: number, b: number): number { return a + b; }",
    ].join("\n");

    expect(classify(source, "add").topology).toBe("valid");
  });

  it("reports an undocumented parameter as a gap, not as stale", () => {
    const source = [
      "/**",
      " * Adds two numbers.",
      " *",
      " * @param a - First addend.",
      " * @returns The sum.",
      " */",
      "export function add(a: number, b: number): number { return a + b; }",
    ].join("\n");

    const result = classify(source, "add");
    expect(result.topology).toBe("partial");
    expect(result.gaps).toEqual(["@param b is not documented"]);
    expect(result.stale).toEqual([]);
  });

  it("reports a missing @returns as a gap", () => {
    const source = [
      "/**",
      " * Adds one.",
      " *",
      " * @param a - The addend.",
      " */",
      "export function inc(a: number): number { return a + 1; }",
    ].join("\n");

    expect(classify(source, "inc").gaps).toEqual([
      "@returns is not documented",
    ]);
  });

  it("does not ask for @returns on a void function", () => {
    const source = [
      "/**",
      " * Logs a message.",
      " *",
      " * @param message - What to log.",
      " */",
      "export function log(message: string): void {}",
    ].join("\n");

    expect(classify(source, "log").topology).toBe("valid");
  });

  it("reports a documented parameter absent from the signature as stale", () => {
    const source = [
      "/**",
      " * Greets someone.",
      " *",
      " * @param name - Who to greet.",
      " * @returns The greeting.",
      " */",
      "export function greet(userId: string): string { return userId; }",
    ].join("\n");

    const result = classify(source, "greet");
    expect(result.topology).toBe("stale");
    expect(result.stale).toEqual([
      "@param 'name' is not a parameter of greet (found: userId)",
    ]);
    expect(confidenceOf(result.topology)).toBe("stale");
  });

  it("says so when the signature declares no parameters at all", () => {
    const source = [
      "/**",
      " * Reads the value.",
      " *",
      " * @param key - The key.",
      " * @returns The value.",
      " */",
      "export function read(): string { return ''; }",
    ].join("\n");

    expect(classify(source, "read").stale).toEqual([
      "@param 'key' is not a parameter of read (it declares none)",
    ]);
  });

  // The trap this whole design is built around: the scanner invents a name for
  // a destructured parameter, so comparing documentation against it naively
  // would report accurate docs on nearly every React component as stale.
  it("never reports staleness for a destructured signature", () => {
    const source = [
      "/**",
      " * Renders a card.",
      " *",
      " * @param title - The heading.",
      " * @param href - Where it links.",
      " * @returns The card element.",
      " */",
      "export function Card({ title, href }: CardProps) { return <div />; }",
    ].join("\n");

    const result = classify(source, "Card", "card.tsx");
    expect(result.stale).toEqual([]);
    expect(result.topology).toBe("valid");
  });

  it("still reports a destructured signature documenting nothing as partial", () => {
    const source = [
      "/**",
      " * Renders a card.",
      " *",
      " * @returns The card element.",
      " */",
      "export function Card({ title }: CardProps) { return <div />; }",
    ].join("\n");

    const result = classify(source, "Card", "card.tsx");
    expect(result.topology).toBe("partial");
    expect(result.gaps).toEqual(["@param props is not documented"]);
  });

  it("accepts dot notation as documenting the object parameter", () => {
    const source = [
      "/**",
      " * Builds a URL.",
      " *",
      " * @param options - The options.",
      " * @param options.host - The host.",
      " * @returns The URL.",
      " */",
      "export function build(options: Options): string { return ''; }",
    ].join("\n");

    expect(classify(source, "build").topology).toBe("valid");
  });

  it("reads JSDoc spellings the comment has not been converted from yet", () => {
    const source = [
      "/**",
      " * Picks a value.",
      " *",
      " * @param {string} [value=1] - The value.",
      " * @returns {string} The picked value.",
      " */",
      "export function pick(value: string): string { return value; }",
    ].join("\n");

    expect(classify(source, "pick").topology).toBe("valid");
  });

  it("checks type parameters in both directions", () => {
    const documented = [
      "/**",
      " * Identity.",
      " *",
      " * @typeParam T - The type.",
      " * @param value - The value.",
      " * @returns The value.",
      " */",
      "export function identity<T>(value: T): T { return value; }",
    ].join("\n");
    expect(classify(documented, "identity").topology).toBe("valid");

    const missing = documented.replace(" * @typeParam T - The type.\n", "");
    expect(classify(missing, "identity").gaps).toEqual([
      "@typeParam T is not documented",
    ]);

    const wrong = documented.replace("@typeParam T", "@typeParam K");
    expect(classify(wrong, "identity").stale).toEqual([
      "@typeParam 'K' is not declared by identity (found: T)",
    ]);
  });

  it("reports `//` prose as its own topology", () => {
    const source = [
      "// Fetches the user by ID.",
      "export function getUser(id: string): string { return id; }",
    ].join("\n");

    const result = classify(source, "getUser");
    expect(result.topology).toBe("line-comments");
    expect(confidenceOf(result.topology)).toBe("low");
  });

  it("reports an undocumented export as no-docs", () => {
    const source = "export function getUser(id: string): string { return id; }";
    expect(classify(source, "getUser").topology).toBe("no-docs");
  });

  it("treats a plain block comment as documenting nothing", () => {
    const source = [
      "/* Not a doc comment. */",
      "export function getUser(id: string): string { return id; }",
    ].join("\n");

    expect(classify(source, "getUser").topology).toBe("no-docs");
  });

  it("ignores tags inside a fenced example", () => {
    const source = [
      "/**",
      " * Adds one.",
      " *",
      " * @param a - The addend.",
      " * @returns The sum.",
      " *",
      " * @example",
      " * ```ts",
      " * @param nonsense - Not a real tag here.",
      " * ```",
      " */",
      "export function inc(a: number): number { return a + 1; }",
    ].join("\n");

    expect(classify(source, "inc").topology).toBe("valid");
  });

  it("does not judge @param tags on a non-callable export", () => {
    const source = [
      "/**",
      " * Configuration.",
      " *",
      " * @param host - Documented oddly, but this is not a function.",
      " */",
      "export interface Config { host: string }",
    ].join("\n");

    expect(classify(source, "Config").topology).toBe("valid");
  });
});
