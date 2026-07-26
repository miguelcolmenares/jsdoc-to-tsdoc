import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createEslintProject,
  DOCUMENTED_SOURCE,
  UNDOCUMENTED_SOURCE,
} from "@/escalator/__tests__/eslint-project";
import { collectRuleViolations, runPreflight } from "@/escalator/preflight-check";

const roots: string[] = [];

async function project(
  options: Parameters<typeof createEslintProject>[0] = {},
): Promise<string> {
  const root = await createEslintProject(options);
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("collectRuleViolations", () => {
  it("keeps only presence-rule messages", () => {
    const violations = collectRuleViolations([
      {
        filePath: "/p/a.ts",
        messages: [
          { ruleId: "tsdoc/syntax", line: 1, column: 1, message: "bad tag" },
          {
            ruleId: "tsdoc-require-2/require",
            line: 4,
            column: 8,
            message: "Missing TSDoc",
          },
          { ruleId: null, line: 9, column: 1, message: "parse error" },
        ],
      },
    ]);

    expect(violations).toEqual([
      {
        filePath: "/p/a.ts",
        line: 4,
        column: 8,
        message: "Missing TSDoc",
      },
    ]);
  });

  it("returns nothing for a clean result set", () => {
    expect(collectRuleViolations([{ filePath: "/p/a.ts", messages: [] }])).toEqual(
      [],
    );
  });
});

describe("runPreflight", () => {
  it("reports clean when every export is documented", async () => {
    const root = await project();

    const result = await runPreflight({ cwd: root });

    expect(result.status).toBe("clean");
    if (result.status !== "clean") return;
    expect(result.filesChecked).toBeGreaterThan(0);
  });

  it("reports the undocumented exports the rule still finds", async () => {
    const root = await project({
      files: { "src/a.ts": DOCUMENTED_SOURCE, "src/b.ts": UNDOCUMENTED_SOURCE },
    });

    const result = await runPreflight({ cwd: root });

    expect(result.status).toBe("violations");
    if (result.status !== "violations") return;
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.filePath).toContain("b.ts");
    expect(result.violations[0]?.message).toMatch(/subtract/);
  });

  it("honours an off override instead of forcing the rule on", async () => {
    // The project exempts `__tests__/`; a preflight that injected its own
    // severity would manufacture a violation CI would never report.
    const root = await project({
      files: {
        "src/a.ts": DOCUMENTED_SOURCE,
        "src/__tests__/a.test.ts": UNDOCUMENTED_SOURCE,
      },
    });

    const result = await runPreflight({ cwd: root });

    expect(result.status).toBe("clean");
  });

  it("still reports violations while the rule sits at warn", async () => {
    // Escalation is exactly the moment those warnings become build failures, so
    // a warning must block just as an error would.
    const root = await project({
      severity: "warn",
      files: { "src/b.ts": UNDOCUMENTED_SOURCE },
    });

    const result = await runPreflight({ cwd: root });

    expect(result.status).toBe("violations");
  });

  it("reports unavailable when ESLint cannot be resolved", async () => {
    const bare = await mkdtemp(join(tmpdir(), "jtt-no-eslint-"));
    roots.push(bare);

    const result = await runPreflight({ cwd: bare });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toMatch(/ESLint could not be loaded/);
  });

  it("reports unavailable when the config fails to load", async () => {
    const root = await project();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(root, "eslint.config.mjs"), "export default [\n");

    const result = await runPreflight({ cwd: root });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toMatch(/ESLint failed to run/);
  });

  it("restricts the run to the given patterns", async () => {
    const root = await project({
      files: { "src/a.ts": DOCUMENTED_SOURCE, "src/b.ts": UNDOCUMENTED_SOURCE },
    });

    const result = await runPreflight({ cwd: root, patterns: ["src/a.ts"] });

    expect(result.status).toBe("clean");
  });
});
