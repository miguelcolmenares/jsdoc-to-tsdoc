---
title: Getting started
description: What jsdoc-to-tsdoc does, the six commands and the order to run them in, and how to use it without installing anything.
order: 1
---

`jsdoc-to-tsdoc` migrates the documentation comments of a TypeScript project from JSDoc to [TSDoc](https://tsdoc.org/), the comment standard that TypeScript tooling actually parses. It rewrites what can be rewritten mechanically, writes stubs for what is missing, and then locks the result in with a lint rule and a CI gate.

It is a **migration tool, not a library**. Nothing in your project imports it, nothing at build or lint time calls it, and once the migration is done it has nothing left to do. You run it with your package runner and it leaves nothing in `package.json`.

## The idea in one minute

Old TypeScript projects are full of comments written for JavaScript:

```ts
/**
 * Fetches a lead by id.
 *
 * @param {string} id - The lead identifier
 * @return {Promise<Lead>} The lead record
 */
```

The `{string}` and `{Promise<Lead>}` repeat what the signature already says, `@return` is not a TSDoc tag, and the tools that read TSDoc (the official parser, `eslint-plugin-tsdoc`, API documentation generators) reject the comment. After the migration the same comment reads:

```ts
/**
 * Fetches a lead by id.
 *
 * @param id - The lead identifier
 * @returns The lead record
 */
```

The page "JSDoc vs TSDoc" lists every difference the tool knows about and why each one exists.

## The workflow

Six commands, in this order. Only three of them write to your files, and every one of those has a preview.

| Step | Command | What it does | Writes files |
| ---- | ------- | ------------ | ------------ |
| 1 | `init` | Sets up `tsdoc.json` and the ESLint rules, without touching a single comment | Config only |
| 2 | `scan` | Reports how your documentation looks today | No |
| 3 | `convert` | Rewrites JSDoc into TSDoc, deterministically | Yes, `--dry-run` previews |
| 4 | `scaffold` | Adds a stub to every export that has no documentation | Yes, `--dry-run` previews |
| 5 | `escalate` | Turns the "missing documentation" rule from a warning into an error | Config only |
| 6 | `check` | The CI gate: validates every comment and reports what is missing | No |

The Tutorials section walks through all six on a small project, with the real output of each command.

## Run it without installing

```bash
npx jsdoc-to-tsdoc <command>          # npm
yarn dlx jsdoc-to-tsdoc <command>     # Yarn
pnpm dlx jsdoc-to-tsdoc <command>     # pnpm
```

Do not add it to `dependencies` or `devDependencies`. Installed, it would sit in every audit, every Dependabot pass and every lockfile diff for a command you run a few times a year.

What does belong in your `devDependencies` is the lint gate the tool leaves behind. `init` reports these four packages, and ESLint loads them on every run from then on:

```bash
npm install -D @microsoft/tsdoc @microsoft/tsdoc-config \
  eslint-plugin-tsdoc eslint-plugin-tsdoc-require-2
```

The distinction is easy to get wrong because `init` installs dev dependencies. Those four run your lint, and the CLI runs once.

## Your first five minutes

```bash
npx jsdoc-to-tsdoc scan --classify     # where does the project stand?
npx jsdoc-to-tsdoc convert --dry-run   # what would change? nothing is written
npx jsdoc-to-tsdoc check               # what does the gate say today?
```

None of these three writes anything, so they are safe to run on any branch. Read the output before you run `init` or `convert`.

## Exit codes

Every command uses the same four codes, which is what makes them usable in CI.

| Code | Meaning |
| ---- | ------- |
| `0` | Success, nothing to report |
| `1` | Logic error, such as a bad flag combination |
| `2` | A file could not be parsed, or a `tsdoc.json` could not be read |
| `3` | Violations found, or, with `--check`, something would change |

## Where to go next

- New to TSDoc: read "JSDoc vs TSDoc", then follow the tutorial "Migrate a JSDoc codebase to TSDoc".
- Adding the gate to a pipeline: "CI integration" and the tutorial "Add the TSDoc gate to CI".
- Looking for one command: `init`, `scan`, `convert`, `scaffold`, `escalate` and `check` each have a page, and "CLI reference" lists every flag.
