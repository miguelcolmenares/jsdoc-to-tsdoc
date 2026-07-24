/**
 * Detection of a target project's layout: ESLint config, `tsconfig.json`, the
 * package manager, and which TSDoc packages are already installed.
 *
 * @remarks
 * `init` reads this once up front to decide what it must create (a `tsdoc.json`),
 * what it must patch (the ESLint flat config), and what it must install. All
 * probing is filesystem-only and never runs the package manager.
 *
 * @since 0.1.0
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The dev dependencies `init` installs to enable the TSDoc tooling: the two
 * ESLint plugins the CLI dogfoods plus the Microsoft parser packages the syntax
 * plugin and `tsdoc.json` loader depend on.
 */
export const REQUIRED_PACKAGES: readonly string[] = Object.freeze([
  "@microsoft/tsdoc",
  "@microsoft/tsdoc-config",
  "eslint-plugin-tsdoc",
  "eslint-plugin-tsdoc-require-2",
]);

/**
 * A supported Node package manager, inferred from the lockfile at the project
 * root. Defaults to `npm` when no lockfile is present.
 */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * The detected shape of a target project.
 */
export interface ProjectLayout {
  /** Absolute project root that was probed. */
  readonly root: string;
  /** Absolute path to the ESLint flat config, or `undefined` if none was found. */
  readonly eslintConfigPath: string | undefined;
  /** Whether a `tsconfig.json` exists at the root. */
  readonly hasTsConfig: boolean;
  /** Absolute path to an existing `tsdoc.json`, or `undefined` if absent. */
  readonly existingTsdocJsonPath: string | undefined;
  /** The package manager inferred from the root lockfile. */
  readonly packageManager: PackageManager;
  /** Every dependency name declared in the project's `package.json`. */
  readonly installedDependencies: ReadonlySet<string>;
}

const ESLINT_FLAT_CONFIG_FILES = [
  "eslint.config.mjs",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
] as const;

const LOCKFILES: readonly (readonly [file: string, manager: PackageManager])[] =
  Object.freeze([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ]);

/**
 * Tests whether a path exists (file or directory).
 *
 * @param path - The absolute path to probe.
 * @returns `true` when `stat` succeeds.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the union of every dependency field in a project's `package.json`.
 *
 * @param root - The absolute project root.
 * @returns The declared dependency names, or an empty set when `package.json` is
 * missing or unparseable.
 */
async function readInstalledDependencies(
  root: string,
): Promise<ReadonlySet<string>> {
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const record = parsed[field];
      // Dependency fields are plain objects keyed by package name. Reject arrays
      // (and other non-plain values) so a malformed `dependencies: []` does not
      // contribute numeric indices as bogus "dependency names".
      if (record && typeof record === "object" && !Array.isArray(record)) {
        for (const name of Object.keys(record)) {
          names.add(name);
        }
      }
    }
    return names;
  } catch {
    return new Set<string>();
  }
}

/**
 * Infers the package manager from the first recognized lockfile at the root.
 *
 * @param root - The absolute project root.
 * @returns The detected manager, defaulting to `npm`.
 */
async function detectPackageManager(root: string): Promise<PackageManager> {
  for (const [file, manager] of LOCKFILES) {
    if (await exists(join(root, file))) {
      return manager;
    }
  }
  return "npm";
}

/**
 * Probes a project root and reports its TSDoc-relevant layout.
 *
 * @param root - The absolute project directory to inspect.
 * @returns The detected {@link ProjectLayout}.
 */
export async function detectProject(root: string): Promise<ProjectLayout> {
  let eslintConfigPath: string | undefined;
  for (const file of ESLINT_FLAT_CONFIG_FILES) {
    const candidate = join(root, file);
    if (await exists(candidate)) {
      eslintConfigPath = candidate;
      break;
    }
  }

  const tsdocJson = join(root, "tsdoc.json");

  return {
    root,
    eslintConfigPath,
    hasTsConfig: await exists(join(root, "tsconfig.json")),
    existingTsdocJsonPath: (await exists(tsdocJson)) ? tsdocJson : undefined,
    packageManager: await detectPackageManager(root),
    installedDependencies: await readInstalledDependencies(root),
  };
}

/**
 * Filters {@link REQUIRED_PACKAGES} down to those not already declared.
 *
 * @param installed - The dependency names already present in `package.json`.
 * @returns The packages `init` still needs to install, in canonical order.
 */
export function missingPackages(
  installed: ReadonlySet<string>,
): readonly string[] {
  return REQUIRED_PACKAGES.filter((pkg) => !installed.has(pkg));
}

/**
 * Builds the shell command that installs the given dev dependencies with a
 * package manager.
 *
 * @param manager - The target package manager.
 * @param packages - The package names to install.
 * @returns The full install command, or an empty string when `packages` is empty.
 */
export function installCommand(
  manager: PackageManager,
  packages: readonly string[],
): string {
  if (packages.length === 0) {
    return "";
  }
  const list = packages.join(" ");
  switch (manager) {
    case "pnpm":
      return `pnpm add -D ${list}`;
    case "yarn":
      return `yarn add -D ${list}`;
    case "bun":
      return `bun add -d ${list}`;
    case "npm":
      return `npm install -D ${list}`;
  }
}
