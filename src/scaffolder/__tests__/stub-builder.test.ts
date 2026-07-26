import { describe, expect, it } from "vitest";

import { buildStub, TODO_MARKER } from "@/scaffolder/stub-builder";
import type { ExportedDeclaration } from "@/scanner";

const declaration = (
  overrides: Partial<ExportedDeclaration> & Pick<ExportedDeclaration, "name" | "kind">,
): ExportedDeclaration => ({
  hasDocComment: false,
  insertPos: 0,
  indent: "",
  line: 1,
  parameters: [],
  typeParameters: [],
  hasReturnValue: false,
  names: [overrides.name],
  ownsLine: true,
  ...overrides,
});

describe("buildStub", () => {
  it("renders a valid TSDoc block ending with a newline", () => {
    const stub = buildStub(declaration({ name: "getUser", kind: "function" }));

    expect(stub.startsWith("/**\n")).toBe(true);
    expect(stub.endsWith(" */\n")).toBe(true);
    expect(stub).toContain(" * Gets the user.");
  });

  it("always includes the TODO marker for review", () => {
    const stub = buildStub(declaration({ name: "getUser", kind: "function" }));
    expect(stub).toContain(TODO_MARKER);
  });

  it("emits one @param per parameter, flagging optionals", () => {
    const stub = buildStub(
      declaration({
        name: "pick",
        kind: "function",
        parameters: [
          { name: "value", isOptional: false },
          { name: "fallback", isOptional: true },
        ],
      }),
    );

    expect(stub).toContain("@param value - TODO(tsdoc): describe value.");
    expect(stub).toContain(
      "@param fallback - TODO(tsdoc): describe fallback (optional).",
    );
  });

  it("emits @typeParam for generics", () => {
    const stub = buildStub(
      declaration({
        name: "identity",
        kind: "function",
        typeParameters: ["T"],
      }),
    );
    expect(stub).toContain("@typeParam T - TODO(tsdoc): describe T.");
  });

  it("emits @returns only when the declaration returns a value", () => {
    const returning = buildStub(
      declaration({ name: "sum", kind: "function", hasReturnValue: true }),
    );
    expect(returning).toContain("@returns");

    const voidFn = buildStub(
      declaration({ name: "log", kind: "function", hasReturnValue: false }),
    );
    expect(voidFn).not.toContain("@returns");
  });

  it("never emits @returns for a non-function export", () => {
    const stub = buildStub(
      declaration({
        name: "LeadFormConfig",
        kind: "interface",
        hasReturnValue: true,
      }),
    );
    expect(stub).not.toContain("@returns");
    expect(stub).toContain(" * Lead form config.");
  });

  it("uses the component template for a React component", () => {
    const stub = buildStub(
      declaration({
        name: "HeroSection",
        kind: "react-component",
        parameters: [{ name: "props", isOptional: false }],
        hasReturnValue: true,
      }),
    );
    expect(stub).toContain(" * Renders the hero section.");
    expect(stub).toContain("@param props -");
  });

  it("labels a Server Action in the summary", () => {
    const stub = buildStub(
      declaration({
        name: "submitContactForm",
        kind: "server-action",
        parameters: [
          { name: "prevState", isOptional: false },
          { name: "formData", isOptional: false },
        ],
        hasReturnValue: true,
      }),
    );
    expect(stub).toContain(" * Server Action. Submits the contact form.");
  });

  it("uses the hook template", () => {
    const stub = buildStub(
      declaration({ name: "useHash", kind: "hook", hasReturnValue: true }),
    );
    expect(stub).toContain(" * React hook for the hash.");
  });

  it("orders tags as summary, @remarks, @typeParam/@param, @returns", () => {
    const stub = buildStub(
      declaration({
        name: "identity",
        kind: "function",
        typeParameters: ["T"],
        parameters: [{ name: "value", isOptional: false }],
        hasReturnValue: true,
      }),
    );

    const positions = [
      stub.indexOf("Identity."),
      stub.indexOf("@remarks"),
      stub.indexOf("@typeParam"),
      stub.indexOf("@param"),
      stub.indexOf("@returns"),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("indents every line to match the declaration", () => {
    const stub = buildStub(
      declaration({
        name: "nested",
        kind: "function",
        indent: "  ",
        parameters: [{ name: "id", isOptional: false }],
      }),
    );

    for (const line of stub.split("\n").filter((l) => l.length > 0)) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });
});
