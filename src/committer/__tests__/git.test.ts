import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commitFile, ensureCommittable } from "@/committer/git";

const run = promisify(execFile);

/**
 * Env vars a parent git process (a hook, `git rebase --exec`) sets for every
 * child it spawns, overriding normal cwd-based repo discovery. Stripped from
 * every `git` call this file makes so the test harness stays correct
 * regardless of what polluted `process.env` while a test runs — including the
 * "git-hook environment leakage" test below, which sets them deliberately.
 */
const GIT_DISCOVERY_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
] as const;

/** Runs git in `cwd` and returns trimmed stdout. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const env = { ...process.env };
  for (const key of GIT_DISCOVERY_ENV_VARS) delete env[key];
  const { stdout } = await run("git", args, { cwd, env });
  return stdout.trim();
}

/** Initializes a repo with an identity and one committed file. */
async function initRepo(root: string): Promise<void> {
  await git(root, "init");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "config", "user.name", "Test");
  // A committed baseline so the tree is clean and `commit` has a parent.
  await writeFile(join(root, "README.md"), "# fixture\n");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "chore: baseline");
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-committer-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ensureCommittable", () => {
  it("passes on a clean git work tree", async () => {
    await initRepo(root);
    await expect(ensureCommittable(root)).resolves.toBeUndefined();
  });

  it("allows untracked files (they are not part of any commit it makes)", async () => {
    await initRepo(root);
    await writeFile(join(root, "new.ts"), "export const x = 1;\n");
    await expect(ensureCommittable(root)).resolves.toBeUndefined();
  });

  it("rejects a directory that is not a git repository", async () => {
    await expect(ensureCommittable(root)).rejects.toThrow(
      /needs a git repository/,
    );
  });

  it("rejects an unstaged modification to a tracked file", async () => {
    await initRepo(root);
    await writeFile(join(root, "README.md"), "# changed\n");
    await expect(ensureCommittable(root)).rejects.toThrow(/clean working tree/);
  });

  it("rejects a staged change", async () => {
    await initRepo(root);
    await writeFile(join(root, "README.md"), "# staged\n");
    await git(root, "add", "-A");
    await expect(ensureCommittable(root)).rejects.toThrow(/clean working tree/);
  });
});

describe("commitFile", () => {
  it("creates one commit carrying only the named file", async () => {
    await initRepo(root);
    await writeFile(join(root, "a.ts"), "export const a = 1;\n");
    await writeFile(join(root, "b.ts"), "export const b = 2;\n");

    await commitFile(root, "a.ts", "docs: convert JSDoc to TSDoc in a.ts");

    const subject = await git(root, "log", "-1", "--pretty=%s");
    expect(subject).toBe("docs: convert JSDoc to TSDoc in a.ts");

    // Only a.ts is in the commit; b.ts is still untracked.
    const files = await git(root, "show", "--name-only", "--pretty=format:");
    expect(files).toBe("a.ts");
    const untracked = await git(root, "status", "--porcelain");
    expect(untracked).toBe("?? b.ts");
  });

  it("commits a path with a space verbatim (no shell splitting)", async () => {
    await initRepo(root);
    await writeFile(join(root, "a b.ts"), "export const a = 1;\n");

    await commitFile(root, "a b.ts", "docs: convert JSDoc to TSDoc in a b.ts");

    const files = await git(root, "show", "--name-only", "--pretty=format:");
    expect(files).toBe("a b.ts");
  });
});

describe("git-hook environment leakage", () => {
  // A git hook (pre-push, pre-commit) sets GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE
  // for every process it spawns, naming *its own* repository. Left unhandled,
  // a `git` call this module makes for a caller-supplied `cwd` would silently
  // target that repository instead of `root` — exactly the failure that
  // surfaced when this suite ran nested inside this project's own pre-push
  // hook rather than directly via `npm run test`.
  const pollutingVars = ["GIT_DIR", "GIT_WORK_TREE"] as const;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of pollutingVars) saved.set(key, process.env[key]);
    process.env.GIT_DIR = "/nonexistent/should-not-be-used/.git";
    process.env.GIT_WORK_TREE = "/nonexistent/should-not-be-used";
  });

  afterEach(() => {
    for (const key of pollutingVars) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("ensureCommittable still resolves against cwd's repo, not the leaked one", async () => {
    await initRepo(root);
    await expect(ensureCommittable(root)).resolves.toBeUndefined();
  });

  it("commitFile still commits into cwd's repo, not the leaked one", async () => {
    await initRepo(root);
    await writeFile(join(root, "a.ts"), "export const a = 1;\n");

    await commitFile(root, "a.ts", "docs: convert JSDoc to TSDoc in a.ts");

    const subject = await git(root, "log", "-1", "--pretty=%s");
    expect(subject).toBe("docs: convert JSDoc to TSDoc in a.ts");
  });
});
