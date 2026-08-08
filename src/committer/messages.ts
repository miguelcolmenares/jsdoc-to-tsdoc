/**
 * Conventional-Commit messages for the per-file commit mode.
 *
 * @since 0.1.0
 */

/**
 * The commit subject for a file `convert` rewrote.
 *
 * @param path - The file's path, relative to the project root.
 * @returns A Conventional-Commit `docs:` subject naming the file.
 */
export function convertCommitMessage(path: string): string {
  return `docs: convert JSDoc to TSDoc in ${path}`;
}

/**
 * The commit subject for a file `scaffold` added stubs to.
 *
 * @param path - The file's path, relative to the project root.
 * @returns A Conventional-Commit `docs:` subject naming the file.
 */
export function scaffoldCommitMessage(path: string): string {
  return `docs: add TSDoc stubs to ${path}`;
}
