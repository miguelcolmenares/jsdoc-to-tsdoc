---
title: CLI reference
description: Every command, every flag, which commands look at test files, and the exit codes, in one place.
order: 9
---

```text
jsdoc-to-tsdoc init | scan | convert | scaffold | escalate | check | merge-driver
```

Run `jsdoc-to-tsdoc <command> --help` for the flags of one command.

## Commands

| Command | Purpose | Writes |
| ------- | ------- | ------ |
| `init` | Bootstrap `tsdoc.json` and the ESLint rules | Config files |
| `scan` | Inventory the JSDoc a conversion would touch, or classify documentation quality | Nothing |
| `convert` | Transform JSDoc comments into TSDoc | Source files |
| `scaffold` | Generate TSDoc stubs for exports with no documentation | Source files |
| `escalate` | Raise `tsdoc-require-2/require` from `warn` to `error` after a preflight | ESLint config |
| `check` | CI gate: validate TSDoc, report undocumented exports | Nothing |
| `merge-driver` | Git merge driver for the severity line. Called by git, not by hand | Merged file |

## Options

| Flag | Commands | Purpose |
| ---- | -------- | ------- |
| `--cwd <dir>` | all | Project directory to scan, default `.` |
| `--dry-run`, `--preview` | `init`, `convert`, `scaffold`, `escalate` | Show a diff without writing |
| `--strict` | `init` | Start `tsdoc-require-2/require` at `error` instead of `warn` |
| `--install` | `init` | Run the detected package manager to install missing dev dependencies |
| `--check` | `convert`, `scaffold`, `escalate` | CI mode: exit `3` if anything would change, never write |
| `--interactive`, `-i` | `convert`, `scaffold` | Review each changed file: accept, skip, edit in `$EDITOR`, quit. Needs a terminal, and cannot be combined with `--dry-run`, `--preview`, `--check` or `--report` |
| `--lite` | `scan`, `convert` | Only `@param` and `@returns` hygiene |
| `--promote-line-comments` | `convert` | Rewrite `//` prose above an undocumented export as a `/** */` comment |
| `--members` | `scaffold` | Also stub each undocumented interface or type-literal member |
| `--severity <level>` | `escalate` | `error` (default) or `warn` to walk it back |
| `--skip-preflight` | `escalate` | Patch the config without running ESLint first |
| `--syntax-only` | `check` | Only validate syntax, ignore missing exports and legacy JSDoc |
| `--classify` | `scan` | Report documentation topology and confidence. Not combinable with `--lite` |
| `--fail-on-missing` | `scan` | Exit `3` when any export has no TSDoc comment, implies `--classify` |
| `--fail-on-stale` | `scan` | Exit `3` when any comment contradicts its signature, implies `--classify` |
| `--include-tests` | `check`, `scaffold`, `scan --classify` | Also inspect the test paths `init` exempts |
| `--only <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to include, for example `"src/lib/**"` |
| `--exclude <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to exclude, for example `"**/*.test.ts"` |
| `--report <fmt>` | all | Machine-readable output, `json` or `md`, on stdout |
| `--enrich <provider>` | `scan` | Model suggestions for LOW and STALE exports: `copilot`, `ollama` or `anthropic`. Off by default |

## Which commands look at test files

Not all of them, and the split is deliberate. `init` writes an ESLint config that turns both TSDoc rules **off** for test paths, so a command's default should match what that config grades.

| Command | Test paths | Why |
| ------- | ---------- | --- |
| `check` | skipped | It is a gate, and reporting what `init`'s own config excuses is phantom work |
| `scaffold` | skipped | It writes, and a stub in an ungraded file is a `TODO` nobody will ever be asked to fill |
| `scan --classify` | skipped | It measures the same thing `check` gates on |
| `scan` (inventory) | included | It counts what `convert` would rewrite |
| `convert` | included | It rewrites JSDoc that already exists, and malformed JSDoc is malformed anywhere |

`--include-tests` opts the first three back in. To keep `convert` away from tests, use `--exclude "**/*.test.ts,**/__tests__/**"`.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | OK |
| `1` | Logic error, such as an invalid flag combination |
| `2` | Parse failure, or a `tsdoc.json` that cannot be read |
| `3` | Violations, or with `--check` something would change |

## Runtimes

The commands run through `npx`, `yarn dlx` and `pnpm dlx`, and all three are tested against a packed tarball on real projects, not assumed to be equivalent.
