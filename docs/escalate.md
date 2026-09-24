---
title: escalate
description: Close the migration by turning missing documentation from a warning into a build failure, safely, plus the git merge driver for the one line that conflicts.
order: 7
---

During a migration, `tsdoc-require-2/require` is a **warning**: undocumented exports are listed but nothing fails. `escalate` finishes the job by changing that one setting from `warn` to `error`, so a missing comment fails CI from that commit on.

```bash
npx jsdoc-to-tsdoc escalate --dry-run
npx jsdoc-to-tsdoc escalate
```

## The change is one line

```diff
-      "tsdoc-require-2/require": "warn",
+      "tsdoc-require-2/require": "error",
```

It only rewrites assignments that are **enabled**. A rule set to `off` is a deliberate opt-out and is never switched on, and the sibling rules `require-param` and `require-returns` are never touched.

## The preflight

Every message the rule emits at `warn` becomes a build failure at `error`. So before patching, `escalate` resolves **your project's own ESLint**, runs it with **your project's own config**, and refuses to continue (exit `3`) while the rule still reports anything.

```text
✗ 3 export(s) still reported by tsdoc-require-2/require:
  src/lib/api.ts:12:8  Missing TSDoc for function fetchLead.
  …
Run `jsdoc-to-tsdoc scaffold` to document them, or --skip-preflight to escalate anyway.
```

Reading the real config, instead of forcing the rule on with an override, is what makes the verdict trustworthy. Every `off` the project configured, such as the test-file exemption that `init` writes, is honoured exactly as CI honours it, so the preflight cannot invent violations that the pipeline would never report.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--dry-run`, `--preview` | Show the diff, write nothing |
| `--check` | Ask "is this repository locked in yet?": exit `3` if not, without running the lint |
| `--severity <level>` | `error` (default), or `warn` to walk an escalation back |
| `--skip-preflight` | Patch without running ESLint first |

`escalate --check` is a cheap CI step that keeps someone from quietly turning the rule back down.

## The merge driver

The one-line change is also the only line that ever conflicts on a long-lived migration branch. Two branches, or a branch and a rebased `main`, flip the same rule, and a plain `git rebase` stops to ask a person to choose between `"warn"` and `"error"`, where the answer is always "whichever is `error`".

`merge-driver` is a [git merge driver](https://git-scm.com/docs/gitattributes#_defining_a_custom_merge_driver) that resolves exactly that conflict and nothing else. If the two versions of the file differ **only** in that one severity value, it keeps the side that already says `error`. If anything else differs, it makes no change and exits non-zero, so git falls back to its normal conflict markers.

You never run it by hand. Git calls it. Wiring it up is a one-time step in two parts, and only one of them can be committed:

1. Commit a `.gitattributes` entry that names the driver:

   ```text
   eslint.config.mjs merge=jsdoc-to-tsdoc-severity
   ```

2. Each contributor registers the driver once, locally:

   ```bash
   git config merge.jsdoc-to-tsdoc-severity.driver "npx jsdoc-to-tsdoc merge-driver %O %A %B"
   ```

Git deliberately does not let a committed file register an executable, because that would let a cloned repository run commands during `git merge` without consent. For the same reason `init` does not set this up for you: running an arbitrary command on every future merge is a decision for the person who owns the repository.

## After escalating

```bash
npx jsdoc-to-tsdoc check          # full gate: syntax, missing, legacy
npx jsdoc-to-tsdoc escalate --check   # exit 0 once the rule is at "error"
```

## See also

- [Lock the migration in with escalate](./tutorials/lock-the-migration-in.md), a step-by-step walkthrough.
- [`check`](./check.md), the gate that runs alongside it.
