import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { VERSION } from "@/index";

// VERSION is a hand-written string constant (not read from package.json at
// build time), so nothing forces the two to move together. It drifted once —
// package.json reached 0.2.0 while this constant, and therefore `--version`
// on the published CLI, still reported 0.1.0. Pin them together here instead
// of trusting the next release to remember.
describe("VERSION", () => {
  it("matches package.json's version field", () => {
    const packageJsonPath = fileURLToPath(
      new URL("../../package.json", import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version: string;
    };

    expect(VERSION).toBe(packageJson.version);
  });
});
