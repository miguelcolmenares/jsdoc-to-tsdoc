/**
 * Unified-diff rendering for `--dry-run` / `--preview` output.
 *
 * @since 0.1.0
 */

import { createPatch } from "diff";

import type { Colors } from "@/reporter/colors";

/**
 * Renders a colored unified diff between two versions of a file.
 *
 * @param relativePath - Path shown in the diff header.
 * @param before - Original file contents.
 * @param after - Rewritten file contents.
 * @param colors - Style functions (pass a disabled set to omit ANSI codes).
 * @returns The colored diff, or an empty string when the contents are identical.
 */
export function formatFileDiff(
  relativePath: string,
  before: string,
  after: string,
  colors: Colors,
): string {
  if (before === after) {
    return "";
  }

  const patch = createPatch(relativePath, before, after, "", "", {
    context: 2,
  });

  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) {
        return colors.dim(line);
      }
      if (line.startsWith("@@")) {
        return colors.cyan(line);
      }
      if (line.startsWith("+")) {
        return colors.green(line);
      }
      if (line.startsWith("-")) {
        return colors.red(line);
      }
      return line;
    })
    .join("\n");
}
