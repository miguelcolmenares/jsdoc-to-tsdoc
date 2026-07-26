import { afterEach, describe, expect, it, vi } from "vitest";

import { describeError, reportCommandFailure } from "@/commands/command-failure";

afterEach(() => {
  process.exitCode = 0;
});

describe("describeError", () => {
  it("uses the message of a real Error", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("keeps the subclass message", () => {
    expect(describeError(new TypeError("bad type"))).toBe("bad type");
  });

  it("returns a thrown string as-is", () => {
    expect(describeError("plain failure")).toBe("plain failure");
  });

  it("renders a plain object as JSON rather than [object Object]", () => {
    expect(describeError({ code: "ENOENT" })).toBe('{"code":"ENOENT"}');
  });

  it("falls back to String() for a value JSON cannot render", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular)).toBe("[object Object]");

    // JSON.stringify throws on BigInt.
    expect(describeError(1n)).toBe("1");
  });

  it("never yields undefined for a nullish throw", () => {
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError(null)).toBe("null");
  });
});

describe("reportCommandFailure", () => {
  it("writes the standard line and sets exit code 1", () => {
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
      });

    try {
      reportCommandFailure("scaffold", new Error("disk full"));
    } finally {
      spy.mockRestore();
    }

    expect(written.join("")).toBe(
      "jsdoc-to-tsdoc: scaffold failed — disk full\n",
    );
    expect(process.exitCode).toBe(1);
  });

  it("still reports usefully when a non-Error is thrown", () => {
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
      });

    try {
      reportCommandFailure("convert", "something odd");
    } finally {
      spy.mockRestore();
    }

    // The previous `(error as Error).message` cast printed "undefined" here.
    expect(written.join("")).toContain("something odd");
    expect(written.join("")).not.toContain("undefined");
  });
});
