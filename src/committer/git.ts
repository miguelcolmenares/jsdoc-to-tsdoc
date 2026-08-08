/**
 * The `git` effects behind `--commit-per-file`: a pre-run guard and a
 * single-file commit.
 *
 * @remarks
 * Runs `git` through `execFile` with an argument list and no shell, so a path
 * with a space or a shell metacharacter is passed verbatim and never
 * interpreted. This is the write boundary of the {@link committer} domain; the
 * commands inject it so the flag's orchestration stays testable.
 *
 * @since 0.1.0
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Runs a `git` subcommand in `cwd` and returns its trimmed stdout.
 *
 * @param cwd - The directory to run `git` in.
 * @param args - The `git` arguments (no shell interpolation is applied).
 * @returns The command's stdout, trimmed.
 */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run("git", [...args], { cwd });
  return stdout.trim();
}

/**
 * Verifies that `cwd` is a git work tree with a clean tracked state, so that
 * every per-file commit will contain exactly the tool's change.
 *
 * @remarks
 * Untracked files are allowed — they are not part of any commit this mode
 * makes — but a tracked file with staged or unstaged modifications is not, since
 * committing a path would sweep the user's in-flight edit into the tool's
 * commit. The check is global rather than per-file: it is the simplest contract
 * to reason about, and a migration run is expected to start from a clean branch.
 *
 * @param cwd - The project directory the command is operating on.
 * @throws When `cwd` is not inside a git repository, or the tracked working
 * tree has uncommitted changes. The message names the cause and how to resolve
 * it.
 */
export async function ensureCommittable(cwd: string): Promise<void> {
  let inside: string;
  try {
    inside = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error(
      "--commit-per-file needs a git repository, but none was found at the target directory.",
    );
  }
  if (inside !== "true") {
    throw new Error(
      "--commit-per-file needs a git repository, but none was found at the target directory.",
    );
  }

  const status = await git(cwd, ["status", "--porcelain"]);
  const trackedChange = status
    .split("\n")
    .some((line) => line.trim() !== "" && !line.startsWith("??"));
  if (trackedChange) {
    throw new Error(
      "--commit-per-file needs a clean working tree, but there are uncommitted changes. " +
        "Commit or stash them first (untracked files are fine).",
    );
  }
}

/**
 * Stages and commits a single file, and nothing else.
 *
 * @remarks
 * Both the `add` and the `commit` are scoped to the one pathspec, so even if the
 * index held something else the commit would still carry only this file — the
 * clean-tree guard in {@link ensureCommittable} makes that the normal case
 * rather than a fallback. The user's own `git` identity and hooks apply; nothing
 * is overridden here.
 *
 * @param cwd - The project directory (the git work tree).
 * @param path - The file to commit, relative to `cwd`.
 * @param message - The commit subject.
 */
export async function commitFile(
  cwd: string,
  path: string,
  message: string,
): Promise<void> {
  await git(cwd, ["add", "--", path]);
  await git(cwd, ["commit", "-m", message, "--", path]);
}
