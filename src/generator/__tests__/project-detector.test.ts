import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectProject,
  installCommand,
  missingPackages,
} from "@/generator/project-detector";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-detect-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("detects the flat config, tsconfig, package manager, and dependencies", async () => {
    await writeFile(join(root, "eslint.config.mjs"), "export default [];\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");
    await writeFile(join(root, "pnpm-lock.yaml"), "");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ devDependencies: { eslint: "^10.0.0" } }),
    );

    const layout = await detectProject(root);

    expect(layout.eslintConfigPath).toBe(join(root, "eslint.config.mjs"));
    expect(layout.hasTsConfig).toBe(true);
    expect(layout.packageManager).toBe("pnpm");
    expect(layout.installedDependencies.has("eslint")).toBe(true);
    expect(layout.existingTsdocJsonPath).toBeUndefined();
  });

  it("defaults to npm and reports an absent config gracefully", async () => {
    const layout = await detectProject(root);

    expect(layout.eslintConfigPath).toBeUndefined();
    expect(layout.hasTsConfig).toBe(false);
    expect(layout.packageManager).toBe("npm");
    expect(layout.installedDependencies.size).toBe(0);
  });

  it("ignores non-object dependency fields instead of harvesting array indices", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        // Malformed: an array where an object is expected.
        dependencies: [],
        devDependencies: { eslint: "^10.0.0" },
      }),
    );

    const layout = await detectProject(root);

    // The array must not contribute numeric keys ("0", "1", …) as dep names.
    expect(layout.installedDependencies.has("0")).toBe(false);
    expect(layout.installedDependencies.has("eslint")).toBe(true);
    expect(layout.installedDependencies.size).toBe(1);
  });

  it("reads packages declared under optionalDependencies", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        optionalDependencies: { "eslint-plugin-tsdoc": "^0.4.0" },
      }),
    );

    const layout = await detectProject(root);

    // optionalDependencies is part of the declared-dependency union, so a plugin
    // pinned there is not later reported as missing.
    expect(layout.installedDependencies.has("eslint-plugin-tsdoc")).toBe(true);
  });
});

describe("missingPackages", () => {
  it("filters out already-installed packages", () => {
    const installed = new Set(["eslint-plugin-tsdoc", "eslint"]);
    const missing = missingPackages(installed);

    expect(missing).not.toContain("eslint-plugin-tsdoc");
    expect(missing).toContain("eslint-plugin-tsdoc-require-2");
  });
});

describe("installCommand", () => {
  it("builds a manager-specific command", () => {
    expect(installCommand("npm", ["a", "b"])).toBe("npm install -D a b");
    expect(installCommand("pnpm", ["a"])).toBe("pnpm add -D a");
    expect(installCommand("yarn", ["a"])).toBe("yarn add -D a");
    expect(installCommand("bun", ["a"])).toBe("bun add -d a");
  });

  it("returns an empty command when nothing needs installing", () => {
    expect(installCommand("npm", [])).toBe("");
  });
});
