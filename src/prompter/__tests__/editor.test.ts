import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveEditor } from "@/prompter/editor";

describe("resolveEditor", () => {
  let savedVisual: string | undefined;
  let savedEditor: string | undefined;

  beforeEach(() => {
    savedVisual = process.env.VISUAL;
    savedEditor = process.env.EDITOR;
    delete process.env.VISUAL;
    delete process.env.EDITOR;
  });

  afterEach(() => {
    restore("VISUAL", savedVisual);
    restore("EDITOR", savedEditor);
  });

  function restore(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it("prefers $VISUAL over $EDITOR", () => {
    process.env.VISUAL = "code --wait";
    process.env.EDITOR = "nano";

    expect(resolveEditor()).toBe("code --wait");
  });

  it("falls back to $EDITOR when $VISUAL is unset", () => {
    process.env.EDITOR = "nano";

    expect(resolveEditor()).toBe("nano");
  });

  it("falls through a blank $VISUAL to a set $EDITOR", () => {
    process.env.VISUAL = "   ";
    process.env.EDITOR = "nano";

    expect(resolveEditor()).toBe("nano");
  });

  it("skips a blank variable and falls through to the default", () => {
    process.env.VISUAL = "   ";
    process.env.EDITOR = "";

    expect(resolveEditor()).toBe("vi");
  });

  it("defaults to vi when nothing is configured", () => {
    expect(resolveEditor()).toBe("vi");
  });
});
