/**
 * Filesystem writes for converted source files.
 *
 * @since 0.1.0
 */

import { writeFile } from "node:fs/promises";

/**
 * Writes text to a file as UTF-8, overwriting any existing content.
 *
 * @param path - The absolute path to write.
 * @param content - The file contents.
 */
export async function writeFileText(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
}
