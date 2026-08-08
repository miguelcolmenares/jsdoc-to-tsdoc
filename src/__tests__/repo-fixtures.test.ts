import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { checkSourceText } from "@/commands/check-file";
import { convertSourceText } from "@/commands/convert-file";
import { createTsdocValidator, type TsdocValidator } from "@/validator";

// Phase-9 ground-truth fixtures. Each case is a before/after pair: `input.ts`
// is pre-migration JSDoc, `expected.ts` is the correct TSDoc, authored by hand
// as the target — the public-repo analogue of the `osa-nextjs` human answer (see
// fixtures/README.md for why these are synthetic and how to reproduce the real
// figure). Because the target is independent of what the tool emits today, a
// rule that regresses to being *consistently* wrong fails here rather than
// silently rewriting a snapshot.
const FIXTURES = fileURLToPath(
  new URL("../../fixtures/convert", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const cases = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function read(name: string, file: string): string {
  return readFileSync(join(FIXTURES, name, file), "utf8");
}

describe("convert fixtures (synthetic ground truth)", () => {
  let validator: TsdocValidator;

  beforeAll(async () => {
    validator = await createTsdocValidator(REPO_ROOT);
  });

  it("discovers the fixture cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)(
    "%s — convert(input) equals the hand-authored target",
    (name) => {
      const { output } = convertSourceText(read(name, "input.ts"), "input.ts", {
        lite: false,
      });
      expect(output).toBe(read(name, "expected.ts"));
    },
  );

  it.each(cases)("%s — the target is valid TSDoc", (name) => {
    const result = checkSourceText(
      read(name, "expected.ts"),
      `${name}/expected.ts`,
      validator,
      { syntaxOnly: true },
    );
    expect(
      result.problems.filter((problem) => problem.kind === "syntax"),
    ).toEqual([]);
  });

  it.each(cases)(
    "%s — the target is stable under a second conversion",
    (name) => {
      const { output } = convertSourceText(
        read(name, "expected.ts"),
        "expected.ts",
        { lite: false },
      );
      expect(output).toBe(read(name, "expected.ts"));
    },
  );
});
