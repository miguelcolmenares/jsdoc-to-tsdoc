# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase-9 conversion ground-truth fixtures (`fixtures/convert/`): one before→
  target pair per conversion class, asserted by `src/__tests__/repo-fixtures.test.ts`
  to check `convert(input) === target`, that the target is valid TSDoc, and that
  the target is idempotent. The target is authored independently as the correct
  TSDoc, so a rule that regresses to being consistently wrong fails the test —
  which a self-snapshot could not catch. Committed fixtures are synthetic because
  the repo is public; the `osa-nextjs` figure (64 of 80 files byte-identical to
  `convert`) is recorded as a locally-reproducible baseline in `fixtures/README.md`.

- `convert --interactive` / `scaffold --interactive` (`-i`) review each changed
  file one at a time — showing its diff and prompting **accept · skip · edit ·
  quit**, where _edit_ opens the proposal in `$VISUAL`/`$EDITOR` and writes back
  what you save. The closing summary counts only the files actually written, so a
  run where you skip half reports half. The flag needs a TTY and is rejected up
  front alongside the non-writing flags (`--dry-run`/`--preview`, `--check`,
  `--report`). The flow lives in a new `prompter` domain: a pure orchestrator
  (`runInteractive`) with the terminal prompt and the editor launcher injected,
  so accept/skip/edit/quit is tested without a real terminal.

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

- `convert` fences an `@example` body when leaving it bare would break TSDoc
  parsing. An unfenced `{` is read as the start of an inline tag and its `}` as
  the end of one, so a comment that reads perfectly fails `check`; the same
  applies to `<`, `>`, and an `@` anywhere, including inside a word. Only a body
  containing one of those is touched — a body of plain calls and URLs is left as
  written, as is any body that already contains a fence, and a hazard inside an
  inline code span is not treated as one because TSDoc reads a code span
  literally. Measured against a hand migration of a real repository, this
  reproduces the human's fencing decision on 101 of 102 examples and removes 95
  of that repository's 143 remaining errors.

- `convert` backticks a bare `@` that appears mid-line in prose so TSDoc stops
  reading it as a tag — a TypeScript path alias (`@/lib/thing`), a scoped
  package (`@scope/pkg`), an address, or a decorator named in a sentence. The
  tag that opens a line is left untouched (it is a real block tag by position,
  even a project custom), as is anything already inside a code span or a fenced
  block, and a standard or known-custom tag name mid-prose. Measured against the
  same hand migration, this clears the remaining bare-`@` class in full, taking
  the repository from 48 errors after fencing down to 30.
- `convert` folds a dotted `@param parent.child` into its parent parameter.
  TSDoc has no dotted-path form and rejects the name, so a converted comment that
  reads perfectly fails `check`. Rather than drop the child documentation, each
  child is folded into the parent's description as a lossless
  `(child: description, …)` list — matching the hand migration's decision for
  small parameter objects and honoring the same no-data-loss principle as the
  `@property` relocation. Handles wrapped child descriptions, several parameter
  objects in one comment, deeper nesting, and JSDoc array-element syntax.
  Measured against the same hand migration, this clears the dotted-`@param` class
  in full, taking the repository from 30 errors down to 4 (the 4 that remain are
  bare `@param` tags with no description that a comment-only tool could recover).
- `convert --promote-line-comments` rewrites a run of `//` prose above an
  undocumented export as the `/** */` comment it was already serving as. Without
  it, `scaffold` inserts an inferred stub between that prose and the declaration
  it explains, so the file gains a worse summary than the one already there. The
  words are carried across unchanged — nothing is recapitalized or
  repunctuated — and the result goes through the conversion rules, so a promoted
  comment is not something the next run rewrites again. Three runs are left
  alone: one holding a tooling directive, which stops working inside a block
  comment; one holding a `*/`, which would close the comment early; and one with
  no prose in it, because the empty `/** */` it would produce satisfies the
  presence rule and would stop `check` reporting the export as undocumented. Off
  by default. `convert` reports how many runs it promoted.
- `@property` descriptions are relocated instead of deleted. TSDoc documents a
  member with its own comment and has no `@property` tag, so the tag still goes
  — but the prose it carries now lands somewhere. It moves onto the member when
  the member has no comment of its own, is dropped as redundant when the member
  already documents itself, and becomes a Markdown list item in the original
  comment when the declaration has no such member (an exported array literal,
  for instance), which keeps `convert` output valid for `check`. `convert`
  reports how many descriptions it moved.
- `Rule.apply` receives the `RuleContext`. Every rule until now decided from the
  comment alone; `@property` cannot, because whether deleting it loses prose
  depends on the declaration below the comment, which the pipeline never sees.
  `RuleContext.removableProperties` carries that decision per comment, and
  omitting it removes nothing — a caller that cannot prove a deletion is safe
  must not have that treated as proof it is.
- `scanner`: `collectMemberTargets` maps each doc comment to the interface or
  type-literal members of the declaration it sits on, with each member's
  documentation state, insertion offset and indentation.
- `parser`: `readPropertyTags` reads each line-leading `@property` tag with its
  description and the exact lines it occupies, folding wrapped descriptions.

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
