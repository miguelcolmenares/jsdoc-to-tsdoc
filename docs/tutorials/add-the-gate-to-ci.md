---
title: Add the TSDoc gate to CI
description: Run check on every pull request, start with a gate the project can pass today, tighten it as the migration progresses, and learn to read a failing run.
order: 3
---

A migration that nothing enforces decays. New code arrives with JSDoc habits, and six months later the project is half migrated again. The fix is a CI step that fails when a comment is invalid. In this tutorial you add it, in a way the project can pass on day one.

You need a repository on GitHub. The Bitbucket pipe is covered at the end.

## Step 1: run the gate locally

Before you write a workflow, run what it will run:

```bash
npx jsdoc-to-tsdoc check
echo "exit code: $?"
```

Two outcomes:

- `exit code: 0` and `✓ TSDoc is valid and complete.`: you can add the strictest gate now, skip to step 3.
- `exit code: 3` and a list of problems: the migration is not finished. That is fine, step 2 explains how to start anyway.

Exit code `2` means a `tsdoc.json` exists but cannot be read. Fix that first, the tool refuses to guess.

## Step 2: pick a gate you can pass today

The gates are ordered from lenient to strict, so you can turn them on one at a time.

| Gate | Command | Passes when |
| ---- | ------- | ----------- |
| Syntax only | `check --syntax-only` | Every comment that exists parses |
| No stale docs | `scan --fail-on-stale` | No comment contradicts its signature |
| No gaps | `scan --fail-on-missing` | Every export has a comment |
| Everything | `check` | Valid, complete, and no JSDoc left |

For a project in the middle of a migration, start with the first one:

```bash
npx jsdoc-to-tsdoc check --syntax-only
```

It never asks for new documentation, so it cannot block a pull request over work nobody was asked to do. It does stop new JSDoc habits from entering, which is the decay you are guarding against.

## Step 3: the workflow

With the GitHub Action:

```yaml
# .github/workflows/tsdoc.yml
name: TSDoc

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: miguelcolmenares/jsdoc-to-tsdoc@v1
        with:
          command: check
          syntax-only: "true"
          version: "1.0.0"
```

Pin `version`. An unpinned gate can start failing on a day when nothing in your repository changed, because a new release added a rule. A pinned one changes only when you decide.

The same step without the action:

```yaml
      - run: npx jsdoc-to-tsdoc@1.0.0 check --syntax-only
```

Both work, and neither adds the tool to your `package.json`. Commit the workflow and open a pull request.

## Step 4: read a failing run

Add `{string}` to a `@param` in a branch and push it. The job fails, and the log ends with something like this (line numbers depend on your file):

```text
src/lib/api.ts
  5:11    syntax  The @param block should not include a JSDoc-style '{type}' (tsdoc-param-tag-with-invalid-type)
✗ 1 problem(s) across 1 file(s).
```

Read a line as `file`, then `line:column`, the category, the message and the rule id. To fix it locally:

```bash
npx jsdoc-to-tsdoc convert
```

The example [Reading check errors](../examples/check-error-codes.md) lists the rule ids you will see most often and what fixes each.

## Step 5: tighten as you go

When the backlog of stubs is done, swap the gate for a stricter one. The change is one line in the workflow:

```yaml
        with:
          command: check
          version: "1.0.0"
```

Now missing documentation fails too. A different route is the coverage gate, which does not care about syntax:

```yaml
      - uses: miguelcolmenares/jsdoc-to-tsdoc@v1
        with:
          command: scan
          version: "1.0.0"
          fail-on-missing: "true"
          fail-on-stale: "true"
```

## Step 6: assert that a step is finished

Three cheap questions are available as gates for the writing commands, and none of them writes anything:

```bash
npx jsdoc-to-tsdoc convert --check      # exit 3 if convert would change anything
npx jsdoc-to-tsdoc scaffold --check     # exit 3 if scaffold would add a stub
npx jsdoc-to-tsdoc escalate --check     # exit 3 if the rule is not at "error" yet
```

They are useful when one step of the migration is done and you want to keep it that way while others continue.

## Using Bitbucket instead

The pipe is not published yet, but the same gate works with `npx` in any pipeline that has Node:

```yaml
# bitbucket-pipelines.yml
pipelines:
  pull-requests:
    "**":
      - step:
          name: TSDoc check
          image: node:22
          script:
            - npx jsdoc-to-tsdoc@1.0.0 check --syntax-only
```

## What you learned

- Run the gate locally first, so the first CI run is not a surprise.
- Start with a gate the project passes and tighten it, not the reverse.
- Pin the version, in the workflow and not in `package.json`.
- Exit code `3` means violations, and `2` means the configuration could not be read.

## Next

[Lock the migration in with escalate](./lock-the-migration-in.md), and the [CI integration](../ci-integration.md) reference for every action input.
