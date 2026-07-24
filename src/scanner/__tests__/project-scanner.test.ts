import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findSourceFiles } from "@/scanner/project-scanner";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-scanner-"));
  await mkdir(join(root, "src", "lib"), { recursive: true });
  await mkdir(join(root, "src", "app"), { recursive: true });
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "src", "lib", "api.ts"), "export const a = 1;");
  await writeFile(join(root, "src", "app", "page.tsx"), "export const b = 2;");
  await writeFile(join(root, "src", "types.d.ts"), "export type T = string;");
  await writeFile(join(root, "src", "app", "page.test.ts"), "test");
  await writeFile(join(root, "node_modules", "pkg", "index.ts"), "leaked");
  await writeFile(join(root, "readme.md"), "# not source");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const rel = (paths: readonly string[]): string[] =>
  paths.map((p) => relative(root, p).replace(/\\/g, "/")).sort();

describe("findSourceFiles", () => {
  it("finds .ts/.tsx files and skips node_modules, .d.ts, and non-source", async () => {
    const files = await findSourceFiles(root);
    expect(rel(files)).toEqual([
      "src/app/page.test.ts",
      "src/app/page.tsx",
      "src/lib/api.ts",
    ]);
  });

  it("honors the only filter", async () => {
    const files = await findSourceFiles(root, { only: ["src/lib/**"] });
    expect(rel(files)).toEqual(["src/lib/api.ts"]);
  });

  it("honors the exclude filter", async () => {
    const files = await findSourceFiles(root, { exclude: ["**/*.test.ts"] });
    expect(rel(files)).toEqual(["src/app/page.tsx", "src/lib/api.ts"]);
  });
});
