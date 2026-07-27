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
- `validator` domain: doc-comment validation against the official
  `@microsoft/tsdoc` parser — the same parser `eslint-plugin-tsdoc` runs, so a
  clean result predicts a clean lint. The project's `tsdoc.json` is loaded and
  applied first, without which every custom tag (`@since` above all) would be
  reported as undefined; a missing `tsdoc.json` is treated as "no config", not
  as an error, since that is the normal state before `init` runs.
- `check` CLI subcommand: the CI gate, and the only command that validates
  rather than transforms. Reports invalid TSDoc syntax, exports with no
  documentation, and comments still holding JSDoc that `convert` would rewrite;
  exits `3` on problems and `2` when `tsdoc.json` exists but cannot be read.
  Supports `--syntax-only`, `--include-tests`, `--only` / `--exclude`, and
  `--report` (`json` / `md`). Test paths are skipped by default because the
  ESLint config `init` generates disables both TSDoc rules for them — the globs
  are now a single shared constant so the two cannot drift. The CLI gates its
  own source with this command (`npm run check:tsdoc`).
- `escalate` CLI subcommand: the fourth migration step, bumping
  `tsdoc-require-2/require` from `warn` to `error` once the preflight is clean.
  Refuses to escalate (exit `3`) while undocumented exports remain, listing
  them; supports `--dry-run` / `--preview` diffs, `--check` (a cheap CI gate
  that exits `3` when the repo is not locked in yet, without running ESLint),
  `--severity` to walk an escalation back to `warn`, `--skip-preflight`, and
  `--report` (`json` / `md`).
- `classifier` domain: classifies every export as `valid`, `partial`,
  `line-comments`, `no-docs` or `stale`, and aggregates to one verdict plus a
  confidence level per file. Stale detection is conservative by design — a
  destructured parameter has no name in the source, so `@param title` on
  `function Card({ title }: CardProps)` cannot be told apart from a stale tag,
  and parameter staleness is not judged for those signatures rather than
  guessed at. A report that flags accurate documentation gets ignored, taking
  its true findings with it. Reachable from the package root alongside every
  other analysis domain; a test now pins that surface, so a domain can no longer
  ship with a barrel but no way for a library consumer to reach it.
- `scan --classify`: documentation topology report with the recommended action
  per bucket. A file lands in the most severe topology among its exports, since
  that is the one naming the next step. Files exporting nothing are counted
  apart from valid ones, and test paths are skipped by default (as `check`
  already does) because the ESLint config `init` writes disables both TSDoc
  rules for them; `--include-tests` opts in. `--report=json` carries the full
  per-declaration detail. `--lite` narrows only the conversion inventory, so
  passing it alongside `--classify` warns on stderr instead of being dropped in
  silence.
- `scan --fail-on-missing` / `scan --fail-on-stale`: CI gates that exit `3` on
  undocumented exports or on documentation that contradicts its signature. Both
  imply `--classify`. They live on `scan` rather than `check`, which already
  exits `3` for undocumented exports.

### Fixed

- `scaffold` no longer emits `@param this` for a function declaring an explicit
  `this` type annotation. TypeScript models it as a parameter, so stubs were
  written into real source documenting an argument callers never pass, and
  `check` accepted them because the syntax is legal TSDoc.

- `convert` no longer emits a duplicate `@packageDocumentation` when a comment
  carries more than one file-level tag. JSDoc routinely pairs them —
  `@fileoverview` for the prose, `@module` for the name — and each was
  translated independently, so the rewritten comment declared the modifier
  twice. At most one is emitted now, the tag is not added at all when the
  comment already has it, and prose from the dropped tags is kept as a summary
  line so no documentation is lost with them.
