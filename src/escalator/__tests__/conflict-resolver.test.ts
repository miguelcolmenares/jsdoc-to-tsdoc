import { describe, expect, it } from "vitest";

import { resolveSeverityConflict } from "@/escalator/conflict-resolver";

const config = (severity: string): string =>
  [
    'import tsdoc from "eslint-plugin-tsdoc";',
    "",
    "export default [",
    "  {",
    '    files: ["src/**/*.ts"],',
    "    rules: {",
    `      "tsdoc-require-2/require": "${severity}",`,
    "    },",
    "  },",
    "];",
    "",
  ].join("\n");

describe("resolveSeverityConflict", () => {
  it("resolves warn (ours) vs error (theirs) to error", () => {
    const base = config("warn");
    const ours = config("warn");
    const theirs = config("error");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBe(theirs);
  });

  it("resolves error (ours) vs warn (theirs) to error — direction does not matter", () => {
    const base = config("warn");
    const ours = config("error");
    const theirs = config("warn");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBe(ours);
  });

  it("is a no-op pass-through when both sides already agree", () => {
    const base = config("warn");
    const ours = config("error");
    const theirs = config("error");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBe(ours);
  });

  it("refuses when a second, unrelated line also differs", () => {
    const base = config("warn");
    const ours = config("error").replace(
      'files: ["src/**/*.ts"]',
      'files: ["src/**/*.ts", "lib/**/*.ts"]',
    );
    const theirs = config("warn");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("refuses when the line counts differ", () => {
    const base = config("warn");
    const ours = config("error");
    const theirs = `${config("warn")}// trailing comment\n`;

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("refuses when one side turned the rule off", () => {
    const base = config("warn");
    const ours = config("off");
    const theirs = config("error");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("still resolves when the assignment's quote style also changed", () => {
    // The whole assignment token — key quotes, colon, value quotes and word —
    // is excised as one span, so a cosmetic quote-style difference confined
    // to that span does not block resolution: the output is the winning
    // side's own line, verbatim, so nothing is fabricated either way.
    const base = config("warn");
    const ours = config("warn");
    const theirsBase = config("error");
    const theirs = theirsBase.replace(
      '"tsdoc-require-2/require": "error",',
      "'tsdoc-require-2/require': 'error',",
    );
    expect(theirs).not.toBe(theirsBase);

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBe(theirs);
  });

  it("refuses when a trailing comment on the same line also differs", () => {
    const base = config("warn");
    const ours = config("warn").replace(
      '      "tsdoc-require-2/require": "warn",',
      '      "tsdoc-require-2/require": "warn", // keep at warn for now',
    );
    const theirs = config("error").replace(
      '      "tsdoc-require-2/require": "error",',
      '      "tsdoc-require-2/require": "error", // locked in',
    );

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("refuses when the differing line is not the presence rule", () => {
    const base = [config("warn"), "// note\n"].join("");
    const ours = [config("warn"), "// note about warn\n"].join("");
    const theirs = [config("warn"), "// note about error\n"].join("");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("refuses when the shared ancestor never configured the rule at all", () => {
    const base = "export default [];\n";
    const ours = config("warn");
    const theirs = config("error");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBeNull();
  });

  it("passes through byte-identical content untouched, no ancestor check needed", () => {
    const base = "export default [];\n";
    const ours = config("error");
    const theirs = config("error");

    const outcome = resolveSeverityConflict(base, ours, theirs);

    expect(outcome.resolved).toBe(ours);
  });
});
