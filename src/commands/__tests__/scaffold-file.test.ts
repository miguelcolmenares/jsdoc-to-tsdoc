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
    const maxIndex = lines.findIndex((line) =>
      line.startsWith("export const MAX"),
    );
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

  it("documents a declaration that shares its line, idempotently", () => {
    // TypeScript treats a comment opening on the same line as preceding code as
    // that statement's trailing comment, so the stub must start a fresh line or
    // the declaration keeps looking undocumented and collects a stub per run.
    const source = "export const a = 1; export const b = 2;";

    const first = scaffoldSourceText(source, "a.ts");
    expect(first.stubsAdded).toBe(2);
    expect(first.output).toMatch(/\n\/\*\*\n \* B\./);
    expect(scaffoldSourceText(first.output, "a.ts").changed).toBe(false);
  });

  it("does not attach a stub to an earlier statement on the same line", () => {
    const result = scaffoldSourceText(
      "const a = 1; export const b = 2;",
      "a.ts",
    );

    expect(result.stubsAdded).toBe(1);
    // The comment must sit after `const a = 1;`, not above it.
    expect(result.output.startsWith("const a = 1;")).toBe(true);
    expect(result.output).toContain(" * B.");
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("keeps surrounding indentation when the declaration shares its line", () => {
    const result = scaffoldSourceText(
      "  const a = 1; export const b = 2;",
      "a.ts",
    );

    // Both the stub and the declaration it carries over must stay aligned.
    for (const line of result.output.split("\n").slice(1)) {
      expect(line.startsWith("  ")).toBe(true);
    }
    expect(result.output).toContain("  export const b = 2;");
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("documents every signature of an overload set", () => {
    // `tsdoc-require-2/require` reports "Missing TSDoc" for each overload
    // signature and for the implementation, so one stub per declaration is what
    // makes the scaffolded file pass the rule this tool installs. Collapsing an
    // overload set into a single stub would leave the file failing lint while
    // `scaffold --check` reported success.
    const source = [
      "export function f(a: string): string;",
      "export function f(a: number): string;",
      "export function f(a: unknown): string { return String(a); }",
    ].join("\n");

    const result = scaffoldSourceText(source, "a.ts");
    expect(result.stubsAdded).toBe(3);
    expect(scaffoldSourceText(result.output, "a.ts").changed).toBe(false);
  });

  it("does not strand the separator as trailing whitespace", () => {
    // The stub replaces the spaces that separated the declaration from the
    // previous statement rather than leaving them at the end of that line.
    const result = scaffoldSourceText(
      "const a = 1; export const b = 2;",
      "a.ts",
    );

    expect(result.output.split("\n")[0]).toBe("const a = 1;");
    for (const line of result.output.split("\n")) {
      expect(line).not.toMatch(/[ \t]+$/);
    }
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

  // Reproduces the osa-nextjs `fetchWPAPI` bug: a hand-written doc comment sat
  // above a `const` that later grew its own one-line comment, so the real doc
  // ended up shadowed in that `const`'s trivia instead of attached to the
  // function it was written for. Before the orphaned-comment check existed,
  // `scaffold` stubbed `fetchWPAPI` directly beneath its own real documentation.
  describe("when a doc-shaped comment is stranded above the previous statement", () => {
    const source = [
      "/**",
      " * Sends a GraphQL query to the WordPress API.",
      " *",
      " * @param query - GraphQL query string",
      " * @returns Response data",
      " */",
      "/** Request timeout for WordPress API calls (ms). */",
      "const WP_API_TIMEOUT_MS = 10_000;",
      "",
      "export const fetchWPAPI = async (query: string) => query;",
    ].join("\n");

    it("does not insert a duplicate stub", () => {
      const result = scaffoldSourceText(source, "a.ts");

      expect(result.output).toBe(source);
      expect(result.changed).toBe(false);
      expect(result.stubsAdded).toBe(0);
    });

    it("reports the skip instead of silently doing nothing", () => {
      const result = scaffoldSourceText(source, "a.ts");

      expect(result.orphanedWarnings).toEqual([
        { name: "fetchWPAPI", line: 10, orphanLine: 1 },
      ]);
    });

    it("still counts the export toward exportsFound", () => {
      expect(scaffoldSourceText(source, "a.ts").exportsFound).toBe(1);
    });
  });

  it("reports no orphaned warnings for an ordinary undocumented export", () => {
    const result = scaffoldSourceText(
      "export function bare(): void {}",
      "a.ts",
    );
    expect(result.orphanedWarnings).toEqual([]);
  });

  describe("with { members: true }", () => {
    it("stubs every undocumented member individually, in source order", () => {
      const source = [
        "export interface HeroProps {",
        "  title: string;",
        "  href: string;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      expect(result.memberStubsAdded).toBe(2);
      // Both the header and each member get their own stub.
      expect(result.stubsAdded).toBe(1);
      expect(result.output).toContain(" * Title.");
      expect(result.output).toContain(" * Href.");
      // Member stubs land directly above their own member, not bunched above
      // the interface as a group.
      const lines = result.output.split("\n");
      const titleIndex = lines.findIndex((line) =>
        line.includes("title: string"),
      );
      const hrefIndex = lines.findIndex((line) =>
        line.includes("href: string"),
      );
      expect(lines[titleIndex - 1]).toBe("   */");
      expect(lines[hrefIndex - 1]).toBe("   */");
    });

    it("does not stub a member that already has its own doc comment", () => {
      const source = [
        "export interface HeroProps {",
        "  /** The title. */",
        "  title: string;",
        "  href: string;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      expect(result.memberStubsAdded).toBe(1);
      expect(result.output.match(/The title\./g)).toHaveLength(1);
      expect(result.output).toContain(" * Href.");
    });

    it("stubs undocumented members even when the header is already documented", () => {
      const source = [
        "/**",
        " * Hero props.",
        " */",
        "export interface HeroProps {",
        "  title: string;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      // The header is untouched — only the member gains a stub.
      expect(result.stubsAdded).toBe(0);
      expect(result.memberStubsAdded).toBe(1);
      expect(result.output.match(/Hero props\./g)).toHaveLength(1);
      expect(result.output).toContain(" * Title.");
    });

    it("gives a callback-typed member @param/@returns tags", () => {
      const source = [
        "export interface HeroProps {",
        "  onSelect: (id: string) => void;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      expect(result.output).toContain("@param id - TODO(tsdoc): describe id.");
      expect(result.output).not.toContain("@returns");
    });

    it("documents a type-literal alias's members the same way as an interface", () => {
      const source = [
        "export type Options = {",
        "  retries: number;",
        "};",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      expect(result.memberStubsAdded).toBe(1);
      expect(result.output).toContain(" * Retries.");
    });

    it("is a no-op on a second run — every member and header already documented", () => {
      const source = [
        "export interface HeroProps {",
        "  title: string;",
        "  href: string;",
        "}",
      ].join("\n");

      const first = scaffoldSourceText(source, "a.ts", { members: true });
      const second = scaffoldSourceText(first.output, "a.ts", {
        members: true,
      });

      expect(second.changed).toBe(false);
      expect(second.stubsAdded).toBe(0);
      expect(second.memberStubsAdded).toBe(0);
    });

    it("does not stub members unless the option is passed", () => {
      const source = [
        "export interface HeroProps {",
        "  title: string;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts");

      expect(result.memberStubsAdded).toBe(0);
      expect(result.output).not.toContain(" * Title.");
    });

    it("skips a declaration with no members without affecting other declarations", () => {
      const source = [
        'export type Status = "new" | "done";',
        "",
        "export interface HeroProps {",
        "  title: string;",
        "}",
      ].join("\n");

      const result = scaffoldSourceText(source, "a.ts", { members: true });

      // Status has no members to stub, but its own header stub still lands.
      expect(result.output).toContain(" * Status.");
      expect(result.memberStubsAdded).toBe(1);
    });
  });
});
