import { describe, expect, it } from "vitest";

import { scaffoldSourceText } from "@/commands/scaffold-file";
import { collectExportedDeclarations } from "@/scanner";

describe("scaffoldSourceText", () => {
  it("documents every undocumented export and leaves documented ones alone", () => {
    const source = [
      "/**",
      " * Already documented.",
      " */",
      "export function documented(): void {}",
      "",
      "export function bare(): void {}",
    ].join("\n");

    const result = scaffoldSourceText(source, "a.ts");

    expect(result.changed).toBe(true);
    expect(result.stubsAdded).toBe(1);
    expect(result.exportsFound).toBe(2);
    // The pre-existing comment is untouched — it appears exactly once.
    expect(result.output.match(/Already documented\./g)).toHaveLength(1);
    // `bare` is not a known verb, so the summary falls back to a noun phrase.
    expect(result.output).toContain(" * Bare.");
  });

  it("reports no change when everything is documented", () => {
    const source = [
      "/**",
      " * Documented.",
      " */",
      "export function documented(): void {}",
    ].join("\n");

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
  });

  it("leaves a file with no exports untouched", () => {
    const source = "const internal = 1;\nfunction helper() {}\n";
    const result = scaffoldSourceText(source, "a.ts");

    expect(result.changed).toBe(false);
    expect(result.exportsFound).toBe(0);
    expect(result.output).toBe(source);
  });

  it("inserts each stub directly above its declaration", () => {
    const source = [
      "export const MAX = 1;",
      "",
      "export function ship(): void {}",
    ].join("\n");

    const lines = scaffoldSourceText(source, "a.ts").output.split("\n");
    const maxIndex = lines.findIndex((line) => line.startsWith("export const MAX"));
    const shipIndex = lines.findIndex((line) =>
      line.startsWith("export function ship"),
    );

    expect(lines[maxIndex - 1]).toBe(" */");
    expect(lines[shipIndex - 1]).toBe(" */");
  });

  it("keeps the original code intact when scaffolding several exports", () => {
    const source = [
      'import type { ReactNode } from "react";',
      "",
      "export interface HeroProps {",
      "  title: string;",
      "}",
      "",
      "export default function Hero({ title }: HeroProps) {",
      "  return <section>{title}</section>;",
      "}",
    ].join("\n");

    const result = scaffoldSourceText(source, "hero.tsx");

    expect(result.stubsAdded).toBe(2);
    for (const line of source.split("\n")) {
      expect(result.output).toContain(line);
    }
    expect(result.counts).toEqual({ interface: 1, "react-component": 1 });
  });

  it("produces output whose stubs are themselves recognized as doc comments", () => {
    const source = [
      "export function alpha(): void {}",
      "export function beta(): void {}",
    ].join("\n");

    const output = scaffoldSourceText(source, "a.ts").output;

    // Re-running the inventory over the scaffolded source must find every
    // export documented — the stubs are real doc comments, and a second
    // scaffold run is therefore a no-op (idempotent).
    const declarations = collectExportedDeclarations(output, "a.ts");
    expect(declarations).toHaveLength(2);
    expect(declarations.every((d) => d.hasDocComment)).toBe(true);

    expect(scaffoldSourceText(output, "a.ts").changed).toBe(false);
  });

  it("documents exports declared through an export list, idempotently", () => {
    const source = [
      "const alpha = 1;",
      "function beta() {}",
      "export { alpha, beta };",
    ].join("\n");

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.stubsAdded).toBe(2);
    // The stubs attach to the local declarations, not the export statement.
    expect(result.output).toContain(" * Alpha.");
    expect(result.output).toContain(" * Beta.");
    expect(result.output.split("\n").at(-1)).toBe("export { alpha, beta };");
    // A second run finds nothing left to do.
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("documents a default-exported local declaration", () => {
    const source = ["function beta() {}", "export default beta;"].join("\n");

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.stubsAdded).toBe(1);
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("names every binding of a multi-binding export in one stub", () => {
    const source = "export const MAX_RETRIES = 1, MIN_RETRIES = 2;";

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.stubsAdded).toBe(1);
    expect(result.output).toContain(" * Max retries and min retries.");
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("does not skip a destructuring export", () => {
    const result = scaffoldSourceText(
      "export const { alpha, beta } = source;",
      "a.ts",
    );
    expect(result.stubsAdded).toBe(1);
    expect(result.output).toContain(" * Alpha and beta.");
  });

  it("tallies stubs by export kind", () => {
    const source = [
      "export function submitForm(prevState: S, formData: FormData) { return prevState; }",
      "export const useHash = (): string => '';",
      'export type Status = "new";',
      "export const MAX = 1;",
    ].join("\n");

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.counts).toEqual({
      "server-action": 1,
      hook: 1,
      "type-alias": 1,
      variable: 1,
    });
  });
});
