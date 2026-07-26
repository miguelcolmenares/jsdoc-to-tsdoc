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
  hook, interface, type alias, class, enum, function, constant), records the
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
