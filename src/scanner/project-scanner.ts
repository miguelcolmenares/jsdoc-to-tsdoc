/**
 * Source-file discovery for a TypeScript project.
 *
 * @since 0.1.0
 */

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { createPathFilter } from "@/scanner/path-filter";

/**
 * Directory names never descended into during discovery.
 */
export const DEFAULT_IGNORE_DIRS: readonly string[] = Object.freeze([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

/**
 * Options controlling {@link findSourceFiles}.
 */
export interface FindSourceFilesOptions {
  /** Restrict results to paths matching at least one of these globs. */
  readonly only?: readonly string[];
  /** Drop paths matching any of these globs. */
  readonly exclude?: readonly string[];
}

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;

/**
 * Tests whether a file name is a discoverable TypeScript source file (excluding
 * declaration files).
 *
 * @param name - The bare file name.
 * @returns `true` for `.ts` / `.tsx` / `.mts` / `.cts` files that are not `.d.ts`.
 */
function isSourceFile(name: string): boolean {
  if (
    name.endsWith(".d.ts") ||
    name.endsWith(".d.mts") ||
    name.endsWith(".d.cts")
  ) {
    return false;
  }
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Recursively finds TypeScript source files under a root directory.
 *
 * @remarks
 * Descends the tree one directory at a time, skipping {@link DEFAULT_IGNORE_DIRS}
 * and declaration files. The walk is sequential rather than a fan-out of
 * `Promise.all` so that a deep or wide tree cannot open an unbounded number of
 * concurrent directory handles and exhaust the process file-descriptor limit
 * (`EMFILE`). Glob filters are matched against each file's path relative to
 * `rootDir`, using forward slashes.
 *
 * @param rootDir - The absolute directory to scan.
 * @param options - Optional `only` / `exclude` glob filters.
 * @returns Absolute file paths in sorted, deterministic order.
 */
export async function findSourceFiles(
  rootDir: string,
  options: FindSourceFilesOptions = {},
): Promise<readonly string[]> {
  const ignore = new Set(DEFAULT_IGNORE_DIRS);
  const passesFilter = createPathFilter(options);
  const results: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name) && !entry.name.startsWith(".")) {
          subdirs.push(join(dir, entry.name));
        }
        continue;
      }
      if (!entry.isFile() || !isSourceFile(entry.name)) {
        continue;
      }
      const absolute = join(dir, entry.name);
      if (passesFilter(relative(rootDir, absolute))) {
        results.push(absolute);
      }
    }

    for (const subdir of subdirs) {
      await walk(subdir);
    }
  };

  await walk(rootDir);

  return results.sort((a, b) => a.localeCompare(b));
}
