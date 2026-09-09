import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTsdocValidatorResolver } from "@/validator/config-resolver";

const roots: string[] = [];

/**
 * Builds a temp project: a set of files (content ignored) under `root`, plus
 * a valid `tsdoc.json` at each given directory defining one custom tag.
 */
async function project(
  paths: readonly string[],
  tsdocJsonAt: Readonly<Record<string, string>> = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jtt-resolver-"));
  roots.push(root);
  for (const path of paths) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, "export const a = 1;\n");
  }
  for (const [dir, tagName] of Object.entries(tsdocJsonAt)) {
    const absolute = join(root, dir, "tsdoc.json");
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(
      absolute,
      JSON.stringify({
        $schema:
          "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
        tagDefinitions: [{ tagName: `@${tagName}`, syntaxKind: "block" }],
      }),
    );
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createTsdocValidatorResolver", () => {
  it("resolves a file to its own directory's tsdoc.json", async () => {
    const root = await project(["packages/a/src/foo.ts"], {
      "packages/a": "since",
    });
    const resolver = createTsdocValidatorResolver(root);

    const validator = await resolver.forFile(
      join(root, "packages/a/src/foo.ts"),
    );

    expect(validator.configPath).toBe(join(root, "packages/a", "tsdoc.json"));
  });

  it("walks up past directories with no tsdoc.json to find an ancestor's", async () => {
    const root = await project(["packages/a/src/deep/nested/foo.ts"], {
      "packages/a": "since",
    });
    const resolver = createTsdocValidatorResolver(root);

    const validator = await resolver.forFile(
      join(root, "packages/a/src/deep/nested/foo.ts"),
    );

    expect(validator.configPath).toBe(join(root, "packages/a", "tsdoc.json"));
  });

  it("falls back to the root config for a package with no override", async () => {
    // The exact shape the issue's design section names: root/tsdoc.json +
    // root/packages/a/tsdoc.json + root/packages/a/src/foo.ts +
    // root/packages/b/src/bar.ts with no override, resolving to root's config.
    const root = await project(
      ["packages/a/src/foo.ts", "packages/b/src/bar.ts"],
      { ".": "rootTag", "packages/a": "since" },
    );
    const resolver = createTsdocValidatorResolver(root);

    const forA = await resolver.forFile(join(root, "packages/a/src/foo.ts"));
    const forB = await resolver.forFile(join(root, "packages/b/src/bar.ts"));

    expect(forA.configPath).toBe(join(root, "packages/a", "tsdoc.json"));
    expect(forB.configPath).toBe(join(root, "tsdoc.json"));
  });

  it("never walks past the project root", async () => {
    // A tsdoc.json placed above `root` must never be picked up: the walk's
    // boundary is the project root passed in, not the filesystem root.
    const outer = await mkdtemp(join(tmpdir(), "jtt-resolver-outer-"));
    roots.push(outer);
    await writeFile(
      join(outer, "tsdoc.json"),
      JSON.stringify({
        $schema:
          "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
        tagDefinitions: [{ tagName: "outerTag", syntaxKind: "block" }],
      }),
    );
    const root = join(outer, "project");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "foo.ts"), "export const a = 1;\n");

    const resolver = createTsdocValidatorResolver(root);
    const validator = await resolver.forFile(join(root, "src", "foo.ts"));

    // No tsdoc.json anywhere under `root`, so this is "absent", not "found
    // one at the outer directory" — configPath must stay undefined.
    expect(validator.configPath).toBeUndefined();
    expect(validator.configErrors).toEqual([]);
  });

  it("caches the walk and the validator across files in the same directory", async () => {
    const root = await project(
      ["packages/a/src/one.ts", "packages/a/src/two.ts"],
      { "packages/a": "since" },
    );
    const resolver = createTsdocValidatorResolver(root);

    const first = await resolver.forFile(join(root, "packages/a/src/one.ts"));
    const second = await resolver.forFile(join(root, "packages/a/src/two.ts"));

    // Same configuration directory reused: the identical validator instance,
    // not merely an equivalent one.
    expect(second).toBe(first);
  });

  it("reuses forDirectory's validator for a file resolving to the same config", async () => {
    const root = await project(["src/foo.ts"], { ".": "since" });
    const resolver = createTsdocValidatorResolver(root);

    const rootValidator = await resolver.forDirectory(root);
    const fileValidator = await resolver.forFile(join(root, "src/foo.ts"));

    expect(fileValidator).toBe(rootValidator);
  });

  it("reports no broken configs when every tsdoc.json is valid", async () => {
    const root = await project(["src/foo.ts"], { ".": "since" });
    const resolver = createTsdocValidatorResolver(root);

    await resolver.forFile(join(root, "src/foo.ts"));

    expect(resolver.brokenConfigs()).toEqual([]);
  });

  it("collects a broken nested config distinctly from a valid root one", async () => {
    const root = await project(["src/foo.ts", "packages/a/src/bar.ts"], {
      ".": "since",
    });
    await writeFile(join(root, "packages/a", "tsdoc.json"), "{ not json");
    const resolver = createTsdocValidatorResolver(root);

    await resolver.forFile(join(root, "src/foo.ts"));
    await resolver.forFile(join(root, "packages/a/src/bar.ts"));

    const broken = resolver.brokenConfigs();
    expect(broken).toHaveLength(1);
    expect(broken[0]?.dir).toBe(join(root, "packages/a"));
    expect(broken[0]?.validator.configErrors.length).toBeGreaterThan(0);
  });

  it("treats a project with no tsdoc.json anywhere as absent, not broken", async () => {
    const root = await project(["src/foo.ts"]);
    const resolver = createTsdocValidatorResolver(root);

    const validator = await resolver.forFile(join(root, "src/foo.ts"));

    expect(validator.configPath).toBeUndefined();
    expect(validator.configErrors).toEqual([]);
    expect(resolver.brokenConfigs()).toEqual([]);
  });
});
