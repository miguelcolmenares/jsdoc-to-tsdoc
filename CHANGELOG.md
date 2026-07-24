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
- `convert` and `scan` CLI subcommands with `--dry-run` / `--preview` diffs.
