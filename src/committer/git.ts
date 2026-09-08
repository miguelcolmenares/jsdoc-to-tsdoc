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
 * Environment variables git uses to skip its normal directory-based repo
 * discovery in favor of a repo named by the *invoking* process.
 *
 * @remarks
 * A parent git process (a hook, `git rebase --exec`, `husky`) sets these for
 * every child it spawns. Left alone, a `git` call this module makes in a
 * caller-supplied `cwd` would silently operate on the parent's repository
 * instead — see {@link cleanGitEnv}.
 */
const GIT_DISCOVERY_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
] as const;

/**
 * A copy of `process.env` with every {@link GIT_DISCOVERY_ENV_VARS} entry
 * removed, so a spawned `git` always discovers its repository from `cwd`.
 *
 * @remarks
 * Deleting the keys, not setting them to `undefined`, matters: Node stringifies
 * an `undefined` env value to the literal text `"undefined"`, which would set
 * `GIT_DIR=undefined` and fail in a different, more confusing way than the bug
 * this exists to prevent.
 *
 * @returns An environment object safe to pass as `execFile`'s `env` option.
 */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of GIT_DISCOVERY_ENV_VARS) delete env[key];
  return env;
}

/**
 * Runs a `git` subcommand in `cwd` and returns its trimmed stdout.
 *
 * @param cwd - The directory to run `git` in.
 * @param args - The `git` arguments (no shell interpolation is applied).
 * @returns The command's stdout, trimmed.
 */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run("git", [...args], { cwd, env: cleanGitEnv() });
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
  } catch (error) {
    // `git` missing from PATH is a different failure than "no repository here",
    // and the fix ("install git") is different too — say so instead of blaming
    // the directory.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "--commit-per-file needs git, but the `git` command was not found on your PATH.",
        { cause: error },
      );
    }
    throw new Error(
      "--commit-per-file needs a git repository, but none was found at the target directory.",
      { cause: error },
    );
  }
  if (inside !== "true") {
    throw new Error(
      "--commit-per-file needs a git repository, but none was found at the target directory.",
    );
  }

  // `--untracked-files=no` lets git filter untracked entries itself, so any
  // remaining output is a tracked change (staged or unstaged) — no porcelain
  // string-parsing, and untracked files are allowed by construction.
  const status = await git(cwd, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (status.trim() !== "") {
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
