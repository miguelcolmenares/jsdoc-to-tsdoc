import { describe, expect, it } from "vitest";

import { buildMemberStub } from "@/scaffolder/member-stub-builder";
import { TODO_MARKER } from "@/scaffolder/stub-builder";
import type { MemberDeclaration } from "@/scanner";

const member = (
  overrides: Partial<MemberDeclaration> & Pick<MemberDeclaration, "name">,
): MemberDeclaration => ({
  hasDocComment: false,
  insertPos: 0,
  insertEnd: 0,
  indent: "  ",
  ownsLine: true,
  line: 1,
  isFunctionLike: false,
  parameters: [],
  hasReturnValue: false,
  ...overrides,
});

describe("buildMemberStub", () => {
  it("renders a plain data property as a noun-phrase summary", () => {
    const stub = buildMemberStub(member({ name: "title" }));

    expect(stub).toContain("  /**\n");
    expect(stub).toContain(" * Title.");
    expect(stub.endsWith(" */\n")).toBe(true);
  });

  it("always includes the TODO marker for review", () => {
    const stub = buildMemberStub(member({ name: "title" }));
    expect(stub).toContain(TODO_MARKER);
  });

  it("renders a callback-typed member as a function summary with tags", () => {
    const stub = buildMemberStub(
      member({
        name: "onSelect",
        isFunctionLike: true,
        hasReturnValue: false,
        parameters: [{ name: "id", isOptional: false, isSynthesized: false }],
      }),
    );

    expect(stub).toContain(" * On select.");
    expect(stub).toContain("@param id - TODO(tsdoc): describe id.");
    expect(stub).not.toContain("@returns");
  });

  it("emits @returns for a callback-typed member that returns a value", () => {
    const stub = buildMemberStub(
      member({ name: "fetch", isFunctionLike: true, hasReturnValue: true }),
    );

    expect(stub).toContain("@returns TODO(tsdoc): describe the return value.");
  });

  it("never emits @param or @returns for a plain data property", () => {
    const stub = buildMemberStub(member({ name: "title" }));

    expect(stub).not.toContain("@param");
    expect(stub).not.toContain("@returns");
  });

  it("indents the comment to match the member", () => {
    const stub = buildMemberStub(member({ name: "title", indent: "    " }));

    expect(stub.startsWith("    /**\n")).toBe(true);
    expect(stub).toContain("    * Title.");
  });

  it("starts the stub on a fresh line when the member shares its line", () => {
    const stub = buildMemberStub(
      member({ name: "title", indent: "  ", ownsLine: false }),
    );

    expect(stub.startsWith("\n  /**\n")).toBe(true);
    expect(stub.endsWith("  ")).toBe(true);
  });
});
