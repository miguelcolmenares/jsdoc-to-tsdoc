import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commitFile, ensureCommittable } from "@/committer/git";

const run = promisify(execFile);

/** Runs git in `cwd` and returns trimmed stdout. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
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
