import { describe, expect, it } from "vitest";

import { canPromote, renderPromoted } from "@/transformer/promote-line-comments";

describe("canPromote", () => {
  it("accepts a run of plain prose", () => {
    expect(canPromote(["// Revalidate weekly (ISR)"])).toBe(true);
    expect(canPromote(["// Fetches the user.", "// Returns null when absent."])).toBe(
      true,
    );
  });

  // A directive arrives here as promotable text: `readLeadingComment` calls a
  // run prose the moment one line is not a directive. Moving the directive into
  // a block comment would stop it working, and it would still sit between the
  // new comment and the declaration, so the rewrite gains nothing either way.
  it("refuses a run containing a tooling directive", () => {
    expect(
      canPromote(["// Fetches the user.", "// eslint-disable-next-line no-console"]),
    ).toBe(false);
    expect(canPromote(["// @ts-expect-error legacy shape", "// Keeps the build green."])).toBe(
      false,
    );
  });

  // `*/` would close the promoted comment early and splice the rest of the
  // prose into the file as code.
  it("refuses a run whose prose would close the comment", () => {
    expect(canPromote(["// Matches the /* … */ form."])).toBe(false);
  });

  // Promoting a run with nothing in it yields an empty `/** */`, which the
  // presence rule accepts — so `check` would stop reporting the export as
  // undocumented without a word of documentation having been written.
  it("refuses a run with no prose in it", () => {
    expect(canPromote(["//"])).toBe(false);
    expect(canPromote(["//   "])).toBe(false);
    expect(canPromote(["//", "//"])).toBe(false);
  });

  it("accepts a run whose blank lines surround real prose", () => {
    expect(canPromote(["//", "// Summary.", "//"])).toBe(true);
  });
});

describe("renderPromoted", () => {
  it("renders one line as a single-line comment", () => {
    expect(renderPromoted(["// Revalidate weekly (ISR)"], "")).toBe(
      "/** Revalidate weekly (ISR) */",
    );
  });

  it("renders several lines as a block, aligned to the indent", () => {
    expect(
      renderPromoted(
        ["  // Revalidate once per day.", "  // Must be a static literal."],
        "  ",
      ),
    ).toBe(
      ["/**", "   * Revalidate once per day.", "   * Must be a static literal.", "   */"].join(
        "\n",
      ),
    );
  });

  it("keeps a blank line as a paragraph break", () => {
    expect(renderPromoted(["// Summary.", "//", "// More detail."], "")).toBe(
      ["/**", " * Summary.", " *", " * More detail.", " */"].join("\n"),
    );
  });

  // The words are the reason to promote the run at all: a human said what the
  // declaration does better than an inferred summary would. Nothing is
  // recapitalized and no full stop is added.
  it("carries the prose across unchanged", () => {
    expect(renderPromoted(["// fetches the user by id, null if absent"], "")).toBe(
      "/** fetches the user by id, null if absent */",
    );
  });

  it("handles a marker with no space after it", () => {
    expect(renderPromoted(["//Compact."], "")).toBe("/** Compact. */");
  });
});
