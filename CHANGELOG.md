# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project foundation: TypeScript (strict), ESLint flat config with TSDoc
  dogfooding, Vitest, and unbuild bundling to a `dist/cli.mjs` ESM binary.
- `parser` domain: JSDoc → TSDoc tag registry and a lightweight comment parser.
- `transformer` domain: deterministic rule pipeline that converts existing JSDoc
  syntax to TSDoc (type-brace stripping, tag renames, redundant-tag removal, and
  the `@returns Promise<T>` / optional-bracket / `@module` fixes learned from
  real-world migrations).
- `scanner` domain: TypeScript-Compiler-API comment extraction and project file
  discovery.
- `generator` domain: project layout detection (ESLint flat config, `tsconfig`,
  package manager, installed deps), custom-tag classification against the TSDoc
  standard, `tsdoc.json` generation/merging, and idempotent ESLint flat-config
  patching.
- `init` CLI subcommand: bootstraps `tsdoc.json` and the ESLint TSDoc rules
  (progressive `warn` by default, `--strict` for `error`), reports the
  dev dependencies to install (`--install` runs the package manager), and
  supports `--dry-run` diffs and `--report` (`json` / `md`).
- `convert` and `scan` CLI subcommands with `--dry-run` / `--preview` diffs.
- `scanner` export inventory: enumerates exported declarations through the
  TypeScript Compiler API, classifies each one (React component, Server Action,
  hook, interface, type alias, class, enum, function, variable), records the
  stub insertion point and indentation, flags declarations that are already
  documented, and skips re-export statements.
- `scaffolder` domain: deterministic summary inference from identifier names
  (verb conjugation, predicate phrasing, acronym / kebab / snake splitting) and
  per-kind TSDoc stub rendering. Every stub carries a `TODO(tsdoc)` marker so
  generated prose can be reviewed with a single grep.
- `scaffold` CLI subcommand: generates TSDoc stubs for exports that have no
  documentation, with `--dry-run` / `--preview` diffs, `--check` (exit `3` for
  CI), `--only` / `--exclude` globs, and `--report` (`json` / `md`) including a
  per-kind breakdown. Generated stubs are valid under `tsdoc/syntax`, satisfy
  `tsdoc-require-2/require`, and re-running the command is a no-op. A contract
  suite runs those two rules over the scaffolded output of every supported
  export form, so the guarantee is checked against the real linter rather than
  against an assumption about it.
- `escalator` domain: a preflight lint check and a severity patch for the
  presence rule. The preflight resolves and runs the *project's own* ESLint with
  the *project's own* config, collecting every `tsdoc-require-2/require` message
  whatever severity it carries — reading the real config instead of forcing the
  rule on through an override is what keeps the verdict equal to what CI will
  report, `off` overrides included. The patch rewrites only enabled assignments,
  so an explicit `off` (the `__tests__/` exemption `init` writes) is never
  switched on and the `require-param` / `require-returns` siblings are never
  touched.
- `escalate` CLI subcommand: the fourth migration step, bumping
  `tsdoc-require-2/require` from `warn` to `error` once the preflight is clean.
  Refuses to escalate (exit `3`) while undocumented exports remain, listing
  them; supports `--dry-run` / `--preview` diffs, `--check` (a cheap CI gate
  that exits `3` when the repo is not locked in yet, without running ESLint),
  `--severity` to walk an escalation back to `warn`, `--skip-preflight`, and
  `--report` (`json` / `md`).
