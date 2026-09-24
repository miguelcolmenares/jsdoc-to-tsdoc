---
title: Lock the migration in with escalate
description: Turn missing documentation from a warning into a build failure, with a preflight that keeps you from breaking the build, and a merge driver for the one line that conflicts.
order: 4
---

During the migration the rule that asks for documentation is a warning, so nothing broke while you worked. To keep the result, it has to become an error. `escalate` does that in one line, and this tutorial shows how to do it without breaking your build.

## Before you start

The project should have no undocumented exports left, because every warning becomes a failure. Check it:

```bash
npx jsdoc-to-tsdoc check
```

You want the `✓ TSDoc is valid and complete.` line. If you still have `TODO(tsdoc)` markers, that is fine: the rule asks for a comment to exist, not for it to be good.

## Step 1: see what it would change

```bash
npx jsdoc-to-tsdoc escalate --dry-run
```

```diff
--- eslint.config.mjs
+++ eslint.config.mjs
@@ -12,5 +12,5 @@
     rules: {
       "tsdoc/syntax": "error",
-      "tsdoc-require-2/require": "warn",
+      "tsdoc-require-2/require": "error",
       "tsdoc-require-2/require-param": "off",
       "tsdoc-require-2/require-returns": "off",
```

One line. The `off` rules and the test-file exemption are not touched, because a rule that is `off` is a deliberate choice and `escalate` never switches one on.

## Step 2: ask the question CI will ask

```bash
npx jsdoc-to-tsdoc escalate --check
echo $?
```

Before you have escalated, it prints the preview message and exits with `3`, meaning "the repository is not locked in yet". This is the command to put in CI later, once it should exit `0`.

## Step 3: escalate, with the preflight

```bash
npx jsdoc-to-tsdoc escalate
```

Before it writes, `escalate` runs **your** ESLint with **your** config and looks at what the rule reports. If anything is reported, it stops with exit `3`:

```text
✗ 3 export(s) still reported by tsdoc-require-2/require:
  src/lib/api.ts:12:8  Missing TSDoc for function fetchLead.
  …
Run `jsdoc-to-tsdoc scaffold` to document them, or --skip-preflight to escalate anyway.
```

That is the tool protecting you: at `error` those three lines would have been three failing builds. Run `scaffold` for them, or write the comments, and run `escalate` again. `--skip-preflight` exists for the case where you have a reason, but the default is the safe one.

Once it passes, the file changes and you commit:

```bash
git add eslint.config.mjs
git commit -m "chore: require TSDoc on every export"
```

## Step 4: prove it works

Add an undocumented export and lint:

```ts
export function newThing(): void {}
```

```bash
npx eslint src
```

The rule now fails on `newThing`. That is the whole point: from this commit on, a pull request cannot add an undocumented export.

## Step 5: keep it from being turned back down

Add `escalate --check` to CI next to `check`:

```yaml
      - run: npx jsdoc-to-tsdoc@1.0.0 escalate --check
```

It exits `0` while the rule is at `error` and `3` if someone lowers it, and it does so without running the lint.

To walk an escalation back on purpose, for example during a large refactor:

```bash
npx jsdoc-to-tsdoc escalate --severity warn
```

## Step 6: the merge conflict you will meet

If two branches both run `escalate`, they change the same line, and a rebase asks a person to choose between `"warn"` and `"error"`. The right answer is always the `error` one. A git merge driver can make that choice for you, and only that choice.

Commit a `.gitattributes` line:

```text
eslint.config.mjs merge=jsdoc-to-tsdoc-severity
```

Then each contributor registers the driver once on their machine:

```bash
git config merge.jsdoc-to-tsdoc-severity.driver "npx jsdoc-to-tsdoc merge-driver %O %A %B"
```

From then on, a conflict that is only about that severity value resolves by keeping `error`. A conflict about anything else in the file still stops for review, exactly as before.

Git does not let a committed file register a command, because that would let any cloned repository run code during a merge. That is why the second half is manual, and why `init` does not do it for you.

## What you learned

- `escalate` is a one-line change, gated by a preflight that runs your own lint.
- `--dry-run` shows the line and `--check` asks whether you are locked in.
- Only the presence rule changes. Everything you set to `off` stays `off`.
- The merge driver resolves one specific conflict and refuses every other.

## You are done

The project now migrates, gates and locks. New code has to be valid TSDoc, has to have a comment on every export, and cannot quietly turn either requirement down.

## See also

The [`escalate` page](../escalate.md) and [Add the TSDoc gate to CI](./add-the-gate-to-ci.md).
