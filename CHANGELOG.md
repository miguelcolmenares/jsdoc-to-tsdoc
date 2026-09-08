# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`--commit-per-file`'s git calls inherited `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` from the invoking process, so running the CLI from inside a git hook silently operated on the hook's own repository instead of the target directory.** A parent git process (a `pre-push`/`pre-commit` hook, `git rebase --exec`) sets these for every child it spawns to skip normal cwd-based discovery — exactly the case `execFile("git", args, { cwd })` does not defend against on its own. This surfaced indirectly: `src/committer/__tests__/git.test.ts` builds real temp-directory repos with nested `git init`/`git commit` calls, and those calls picked up this repository's own `pre-push` hook environment when the suite ran nested inside that hook, failing with `fatal: not a git repository` against a path that was never asked for. `src/committer/git.ts` now strips the discovery-override variables from the environment it passes to every `git` call, so `cwd` alone decides which repository is targeted, regardless of what environment the invoking process leaked. Two regression tests reproduce the leak directly (pollute `process.env` with the same variables a hook would set, assert `ensureCommittable`/`commitFile` still target `cwd`'s repo) rather than relying on a hook actually being present to exercise it.

- **The same `GIT_DIR`/`GIT_WORK_TREE` leak also broke `src/commands/__tests__/commit-per-file.test.ts`**, which has its own separate copy of the same temp-repo-building `git()` helper rather than importing the one fixed above — a grep for every other spawn of `git` via `execFile` in `src/` after that fix turned up this second, independent occurrence. Same fix: the discovery-override variables are stripped from its environment too.

- **`@throws {SyntaxError}` survived conversion and produced two syntax errors**, because `remove-type-braces` covered `@param`, `@returns`, `@property`, `@typeParam` and `@type` but not `@throws` — the official parser then read the `{` as opening an inline tag. Widening that rule was the wrong fix: it strips braces precisely because the TypeScript signature still carries the type, and a thrown type appears in no signature, so stripping would have deleted the only information the tag holds. A new `link-throws-type` rule rewrites it into TSDoc's own form, `@throws {@link SyntaxError}`, which parses cleanly and keeps the type as a reference. A type that could never resolve — a primitive, a union, a generic — becomes plain prose instead, because a link to one is valid syntax that renders permanently broken, asserting a reference that does not exist. An existing `{@link}` is left alone, so re-running `convert` is a no-op.
- **`@exception` was neither renamed nor removed**, so JSDoc's synonym for `@throws` reached `check` as an undefined tag. It now renames to `@throws` before the type is linked.
- **`convert` emitted a trailing space on any line a rule emptied, so it produced files that passed `check` and failed the consumer's own `prettier --check`.** A doc-comment prefix greedily absorbs the whitespace after `*` so that content always starts at the first non-space character, which meant an emptied line reassembled as `" * "` rather than `" *"` — the format gate the migration is supposed to leave green was the one thing the tool could still turn red. The prefix is now trimmed whenever a rule empties a line, for every rule rather than the one that surfaced it. The line is kept rather than dropped, so a `@description` written above its prose still separates the summary from the description instead of merging both into one paragraph. The trim is deliberately conditional on a rule having changed the line: a blank line the author wrote, trailing space and all, is still reconstructed verbatim, which preserves the round-trip property and keeps `convert` from reporting files whose only change is whitespace it normalised on the way past.
- **`convert` left `@summary` in place, so a file it reported as converted then failed `check` with `tsdoc-undefined-tag`.** TSDoc has no `@summary` — the leading paragraph is the summary — and the tag appeared in no list, so the two commands in the documented workflow disagreed about the same file. Its prose now survives as the comment summary, which is already how `@description`, `@desc` and `@classdesc` are treated. The rule that performs the strip built its own pattern from a hardcoded list instead of reading `PREFIX_ONLY_TAGS`, which is why the tag could be absent from the registry and the behaviour at once; it now derives the pattern from the registry, and a test iterates the registry so the two cannot drift apart again. `convert`'s no-worse-than-the-original guard did not catch this because the comment was already failing before the conversion.
- **`yarn dlx jsdoc-to-tsdoc` crashed on startup with `Cannot find package 'typescript'`.** `typescript` was a peer dependency, and Yarn does not install peers — so the `npx` invocation the README documents everywhere worked while its Yarn equivalent did not, even in a project with TypeScript already installed, because `dlx` resolves in an isolated environment that cannot see the workspace's `node_modules`. (`pnpm dlx` was unaffected: pnpm 8+ auto-installs peers by default, verified against the published 0.2.1.) Moved to `dependencies` with the same `>=5.0.0 <7.0.0` range. It is still never bundled (`externals` in `build.config.ts` is unchanged), and the peer pattern did not apply here in the first place: nothing in the public surface accepts or returns a `ts.*` type, so there is no compiler instance for a host project to share.
- **`scan --classify --report=json` omitted every file with no exports from `files[]` while `filesScanned` counted them**, so the array could not be reconciled with the totals and the bucket the human table has always shown could not be enumerated from the machine output at all. Every scanned file is now listed, with `topology: null` for those, and `files.length === filesScanned` holds. `filesWithoutExports` is counted from that array rather than derived as `filesScanned - files.length` — subtraction could not tell "nothing to classify here" apart from "this file went missing", so any future filter that dropped an entry would have been silently reported as a no-export file.
- The human table's "No exports" row is now **"Nothing to document"**. It was accurate for a file that declares nothing and misleading for a barrel, which exports plenty while declaring nothing to attach a comment to. The `filesWithoutExports` JSON key is unchanged.
- **`init` reported Jest's `@jest-environment` file pragma as an unknown tag**, and as `@jest` — truncated at the hyphen, so the reported name appeared nowhere in the source. Both actions the message offers are wrong for it: registering it in `tsdoc.json` declares a documentation tag that is not one, and removing it silently changes which environment the test runs in. Hyphenated tokens (`@jest-environment`, `@vitest-environment`, `@ts-check` in a block comment) are now classified as `pragma` — visible in `--report=json`, never surfaced as a decision to make. `TagClassification` gains a `"pragma"` member, which widens the type on `aggregateCommentTags`'s public result.
- **`init` could not patch the two ESLint flat-config shapes the common scaffolds produce**, so every project using one got the "could not patch automatically" fallback and had to paste the block in by hand. The array assigned to a `const` and then default-exported is what `create-next-app` emits; the variadic `defineConfig(a, b, c)` is ESLint's own documented API and was recorded as a known limitation in `AGENTS.md` since the `image-optimizer` dogfood. The `const`-array shape is matched by resolving the default-exported identifier rather than by a pattern, because `const \\w+ = [` matches any array and would otherwise pick an unrelated one declared above the real config — a test pins that.
- **`findContainerInsertPoint` compared a match index against an end offset** when choosing between competing shapes, so with more than one recognized container it could return the insertion point of the later match. Not reachable with the previous five patterns; it would have become reachable with these two.
- **`scaffold` wrote `TODO(tsdoc)` stubs into test files that `init`'s own generated ESLint config exempts from both TSDoc rules.** `check` and `scan --classify` already skipped those paths, so `check` would report a missing comment in `src/`, print "Run `jsdoc-to-tsdoc scaffold`", and `scaffold` would answer by stubbing the whole test tree as well — creating markers no gate will ever ask anyone to fill, in files no gate grades. `scaffold` now skips test paths by default and takes `--include-tests`, matching `check`. `convert` and the default `scan` inventory are unchanged and still include tests: they rewrite JSDoc that is already there rather than creating an obligation. The README now states which commands look at test paths and why, which was not written down anywhere.
- **The startup Compiler API check only covered three of the thirty members the scanner calls**, so a partial shim could satisfy it and then crash exactly as before — the failure the check exists to prevent. It now covers every runtime `ts.*` member the source references, and a test derives that list from `src/` so the guard cannot silently fall behind: adding a `ts.isFoo()` call without a matching entry fails, and so does leaving an entry behind after the call is removed. Caught in review on #76.
- The CLI now verifies the resolved `typescript` exposes the classic Compiler API before dispatching, and exits `2` with a sentence naming the version and the supported range. Previously a package that imported cleanly but carried no `createSourceFile` — TypeScript 7's restructured package, a bundler shim — surfaced as `Cannot read properties of undefined (reading 'TSX')` several frames inside whichever command ran first, naming neither TypeScript nor the version.

### Security

- **Four high-severity advisories against `fast-uri` (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp), cleared by moving the lockfile from 3.1.5 to 3.1.7.** It reaches this package as a transitive runtime dependency — `@microsoft/tsdoc-config` → `ajv` → `fast-uri` — and `ajv@8.18.0` already permitted the patch (`^3.0.1`), so the lockfile was simply resolved before 3.1.6 published rather than held back by a constraint; no `overrides` entry was needed to take it. All four are host-confusion and SSRF classes in `resolve()` and `normalize()`, and none is reachable through this tool: the only URIs `ajv` resolves here are the `$id`/`$ref` of the TSDoc schema and whatever a project's own `tsdoc.json` carries, and nothing acts on a resolved host with an outbound request. **The bump does not change what consumers install.** npm ignores a dependency's lockfile, and `@microsoft/tsdoc-config` is imported lazily and never bundled, so a consumer resolves `fast-uri` themselves through `ajv`'s own range and has had the patched version since it published. What this fixes is the repository's own installs and CI, which is also where the alerts were raised.

### Documentation

- **The README never said the CLI is not a project dependency.** Every example used `npx`, which implies it, but nothing stated it and there was no Installation section to state it in — the headings went straight from The Problem to Usage. The reference repo this tool was dogfooded on, set up by the author, carried `jsdoc-to-tsdoc` in its `devDependencies` as a result. There is now an **Installation** section that says plainly there isn't one, gives the invocation for all three package runners, and separates the CLI from the four packages `init` reports — those are the lint gate that outlives the migration, and confusing the two is the whole failure mode. `init`'s own closing output now draws the same line, since that is the moment the decision gets made.
## [0.2.1] - 2026-09-02

### Fixed

- **`peerDependencies.typescript` had no upper bound (`>=5.0`), so a fresh/isolated install (e.g. `npx jsdoc-to-tsdoc`) silently resolved TypeScript 7.x as the peer once it was published.** TypeScript 7's npm package is restructured entirely around the native/Go rewrite — its `"."` export now resolves to `lib/version.cjs` instead of the classic Compiler API — so every command that reads `ts.ScriptKind`, `ts.createSourceFile`, etc. (`scan`, `init`, `convert`) crashed with `Cannot read properties of undefined (reading 'TSX')` / `'TS'`. Capped to `>=5.0.0 <7.0.0`, which keeps both currently-working majors (5.x, this repo's own pin; 6.x, confirmed working live) and excludes the broken one.

## [0.2.0] - 2026-08-24

### Added

- `convert` now proves a transformed file is no worse than the original before writing it — it runs the same official `@microsoft/tsdoc` validator `check` uses on both the original and converted file text, and skips writing (exit 1, listed on stderr) any file where the conversion introduced more violations than it started with. A safety net against a future rule bug, not a currently-triggerable path.
- `.github/instructions/architecture.instructions.md` and `.github/instructions/tsdoc-gotchas.instructions.md` — repository-scoped agent guidance covering DDD domains, the rule-pipeline model, and the full catalog of what breaks the official `tsdoc/syntax` parser in real code.
- `.github/skills/add-transformer-rule/` — the first reusable agent skill: write, register, and test a new conversion rule.

### Fixed

- The blank content line a removed tag block (`@async`, `@function`, …) leaves behind before the closing `*/` is now trimmed. Valid TSDoc either way, but untidy output the tool was writing into user files.

## [0.1.0] - 2026-08-20

### Added

- `convert --commit-per-file` / `scaffold --commit-per-file` commit each changed
  file on its own, so a migration lands as one reviewable commit per file
  (`docs: convert JSDoc to TSDoc in <path>` / `docs: add TSDoc stubs to <path>`)
  instead of one sprawling diff. It refuses to start unless the target is a git
  work tree with a clean tracked state — the guard runs before any write, so a
  rejected run leaves nothing behind — and untracked files are allowed. Rejected
  alongside the non-writing flags (`--dry-run`/`--preview`, `--check`,
  `--report`); combines with `--interactive`, committing each accepted file
  (including a hand `edit` in `$EDITOR`) in review order. Git runs through
  `execFile` with an argument list and no shell, so a path with a space or a
  shell metacharacter is committed verbatim. The closing summary reports how many
  files were committed. The flow lives in a new `committer` domain, kept out of
  the library barrel like `prompter`/`reporter`/`writer`.

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

- `convert` no longer leaves a description-less `@typeParam` behind, which TSDoc
  rejects (`tsdoc-param-tag-missing-hyphen`) exactly as it does a hyphenless
  `@param`. A JSDoc `@template T` with no description renamed to a bare
  `@typeParam T` and failed `check`; a new `drop-bare-type-param` rule removes
  the tag instead — it documents nothing a reader cannot see in the
  declaration's `<T>` clause, so no prose is lost. A bare `@param` is
  deliberately left for `check` to surface, since a value parameter's name is
  the only record the author meant to document it. The rule is `--lite`-safe, so
  the minimal `@param`/`@returns` pass keeps its output valid too.

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
