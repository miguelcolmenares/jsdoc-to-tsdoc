# AGENTS.md — Technical orientation for AI agents

> **What this file is.** A fast, durable context map so an agent can pick up
> work without re-scanning the whole tree. It captures the _why_ behind the
> architecture, the conventions to follow, and the lessons already learned.
>
> **How it differs from [`PLAN.md`](./PLAN.md).** `PLAN.md` is the product
> roadmap — gap analysis, scope, phases, what ships next. `AGENTS.md` is the
> _engineering_ orientation — how the code is shaped and how to extend it
> safely. When they disagree, the code wins; then update whichever doc drifted.

---

## 1. Purpose of the repo

`jsdoc-to-tsdoc` is a zero-config CLI (`npx jsdoc-to-tsdoc <command>`) that
migrates a TypeScript project's documentation comments from **JSDoc** to the
**TSDoc** standard, and bootstraps the tooling that keeps them valid.

It exists because the ecosystem has the _pieces_ (`@microsoft/tsdoc` parser,
`eslint-plugin-tsdoc` syntax rule, `eslint-plugin-tsdoc-require-2` presence
rule) but **no tool orchestrates the end-to-end migration** we did by hand
across several real Next.js repos. The workflow it automates is four steps:

```
init  →  convert  →  scaffold  →  escalate
(bootstrap) (JSDoc→TSDoc)  (stub docs)  (warn→error)
```

---

## 2. Current status (what is shipped)

| Command   | State        | What it does |
|-----------|--------------|--------------|
| `init`    | **shipped**  | Generates/merges `tsdoc.json`, patches the ESLint flat config, reports deps to install. |
| `scan`    | **shipped**  | Read-only inventory of what `convert` would change, plus `--classify`: documentation topology, confidence levels, and the `--fail-on-missing` / `--fail-on-stale` gates. |
| `convert` | **shipped**  | Transforms existing JSDoc comments into TSDoc syntax (10-rule pipeline). |
| `scaffold`| **shipped**  | Generates TSDoc stubs for undocumented exports (the ~80% of real-world work). |
| `escalate`| **shipped**  | Bumps `tsdoc-require-2/require` from `warn` → `error`, gated on a preflight ESLint run. |
| `check`   | **shipped**  | CI gate — validates comments with the official `@microsoft/tsdoc` parser, reports undocumented exports and leftover JSDoc. |

Domains present: `parser`, `scanner`, `transformer`, `scaffolder`, `generator`,
`escalator`, `validator`, `classifier`, `reporter`, `writer`, `commands`. See `PLAN.md` → _Implementation Status_ for the
running tally and `PLAN.md` → _Development Roadmap_ for phase order.

**Picking work up again?** Go to §11 — it carries what to do next and why, and
§12 carries the decisions and traps behind the code that is already here.

---

## 3. Architecture at a glance

**DDD-lite: folder = domain, never tech layer.** No `utils/`, `helpers/`,
`services/`. Each domain owns a barrel `index.ts` that is its only public
contract; internal files are private and renameable.

```
src/
├── cli.ts                # citty entry point + subcommand dispatch (has the shebang)
├── index.ts             # programmatic library surface (re-exports each domain)
├── commands/            # one file per subcommand (citty default export) + convert-file orchestrator
├── parser/              # comment-line traversal, JSDoc→TSDoc tag registry, comment inspection
├── scanner/             # TS-compiler-API comment extraction, file discovery, glob path filter
├── transformer/         # the deterministic rule pipeline + rules/
├── scaffolder/          # name→prose inference + TSDoc stub rendering for undocumented exports
├── generator/           # init's building blocks: project detection, tag classification, tsdoc.json, eslint patcher
├── escalator/           # escalate's building blocks: preflight ESLint run + rule-severity patch
├── validator/           # check's building block: official @microsoft/tsdoc validation
├── reporter/            # colored diffs, tables, JSON/Markdown output, ANSI colors
└── writer/              # async file writes
```

**Data-flow of a `convert`:** `scanner.extractJsDocComments` (via
`ts.getLeadingCommentRanges`) → for each comment `transformer.runPipeline`
(ordered rules over the comment text) → `scanner.applyEdits` (one left-to-right
pass over the original text, joined once) → `writer` or `reporter`. The shared orchestrator is
[`src/commands/convert-file.ts`](./src/commands/convert-file.ts) (pure, no I/O),
reused by both `scan` (counting) and `convert` (writing).

**Data-flow of a `scaffold`:** `scanner.collectExportedDeclarations` (via the TS
compiler API — classifies each export, records its insertion offset and indent,
flags existing docs) → `scanner.undocumentedDeclarations` → for each,
`scaffolder.buildStub` (name inference + per-kind template) → `scanner.applyEdits`
(zero-width insertions, applied in one left-to-right pass) → `writer` or `reporter`.
The shared orchestrator is [`src/commands/scaffold-file.ts`](./src/commands/scaffold-file.ts)
(pure, no I/O). Re-exports are skipped; a second run is a no-op (idempotent).

**Data-flow of an `init`:** `generator.detectProject` (layout) +
`generator.collectProjectTags` (classify tags) → `generator.generateTsdocJson`/
`mergeTsdocJson` + `generator.patchEslintFlatConfig` → `reporter` diffs or
`writer`. See [`src/commands/init.ts`](./src/commands/init.ts).

**Data-flow of an `escalate`:** `generator.detectProject` (find the flat config)
→ `escalator.updateRuleSeverity` (text patch of the presence rule's severity) →
`escalator.runPreflight` (resolve and run the **project's own** ESLint with the
**project's own** config; collect every `tsdoc-require-2/require` message
regardless of severity) → `reporter` diff or `writer`. Both halves respect an
explicit `off`: the patcher never enables it, and the preflight never overrides
it. See [`src/commands/escalate.ts`](./src/commands/escalate.ts).

**Data-flow of a `check`:** `validator.createTsdocValidator` (loads
`<cwd>/tsdoc.json` and configures the **official** parser) → per file
`commands/check-file.checkSourceText`, which merges three sources: the official
parser's violations, `scanner.undocumentedDeclarations`, and whether
`convert` would still rewrite the file → `reporter`. Never writes. Exit `3` on
problems, `2` when `tsdoc.json` is unreadable. See
[`src/commands/check.ts`](./src/commands/check.ts).

---

## 4. Key design decisions (and the reasoning)

1. **Subcommand model, not one flow** (`citty`). Each verb mirrors a real
   migration step and is independently re-runnable.
2. **Rule-based deterministic pipeline.** Every transform is an independent,
   pure `Rule` (`name`, `summary`, `liteSafe`, `apply(comment) => comment`).
   Same input → same output. No time, randomness, or I/O in the pipeline. Order
   matters and is fixed in [`transformer/rules/index.ts`](./src/transformer/rules/index.ts).
3. **Fence-aware, format-preserving edits.** Rules operate through
   [`parser/comment-lines.ts`](./src/parser/comment-lines.ts) (`mapCommentLines`),
   which hands each rule only the _content_ of a line (after ` * `), never the
   structural scaffolding (`/**`, ` *`, `*/`) and never lines inside triple-backtick
   fences. This is why `@example` code is preserved verbatim. **Never rewrite
   comments with raw regex over the whole string — go through `mapCommentLines`.**
4. **TS Compiler API for extraction**, not regex. `getLeadingCommentRanges`
   yields precise offsets and never matches inside strings/templates.
5. **Text-based, idempotent ESLint patching**, not AST re-print. Preserves the
   author's formatting. Recognizes `defineConfig([…])`, `tseslint.config(…)`,
   and bare-array flat configs; falls back to a copy-pasteable snippet when the
   shape is unknown. Idempotency is gated on a real `import`/`require` of the
   syntax plugin, not a bare substring.
6. **Progressive enforcement by default.** `init` starts `tsdoc-require-2/require`
   at `warn`; `--strict` opts into `error`. `require-param`/`require-returns`
   are **off** by default (they false-positive on interfaces/types/consts).
7. **Non-destructive by default.** Every mutating command supports `--dry-run`
   and shows a unified diff before writing.
8. **Machine-readable output.** `--report=json|md` on every command for CI.
9. **No LLM dependency.** Deterministic templates and name inference only;
   LLM enrichment is an explicit, post-v0.1 opt-in.
10. **Fallible operations return discriminated unions**, not throws
    (e.g. `EslintPatchResult = { ok: true; … } | { ok: false; reason; snippet }`).
    `throw` is reserved for programmer-error invariants.
11. **ESM-only, `typescript` as a peer dep** (never bundle the compiler),
    bundle target **< 500 KB gzipped** (CI-gated), heavy deps lazy-imported.

---

## 5. Commands & flags (public surface)

```bash
npx jsdoc-to-tsdoc init      # bootstrap: tsdoc.json + eslint rules + deps to install
npx jsdoc-to-tsdoc scan      # read-only inventory
npx jsdoc-to-tsdoc convert   # JSDoc → TSDoc
npx jsdoc-to-tsdoc scaffold  # TSDoc stubs for undocumented exports
npx jsdoc-to-tsdoc escalate  # warn → error, gated on a preflight ESLint run
npx jsdoc-to-tsdoc check     # CI gate: validate TSDoc, exit 3 on problems
```

| Flag | Commands | Purpose |
|------|----------|---------|
| `--cwd <dir>` | all | Project directory (default `.`). |
| `--dry-run` / `--preview` | `init`, `convert`, `scaffold`, `escalate` | Show a diff; write nothing. |
| `--strict` | `init` | Start the presence rule at `error` instead of `warn`. |
| `--install` | `init` | Run the detected package manager to install missing dev deps. |
| `--check` | `convert`, `scaffold`, `escalate` | CI mode — exit `3` if anything would change; never writes. |
| `--syntax-only` | `check` | Only validate comment syntax. |
| `--include-tests` | `check` | Also check the test paths `init` exempts. |
| `--lite` | `scan`, `convert` | Only `@param`/`@returns` hygiene (`Rule.liteSafe`). |
| `--severity <level>` | `escalate` | Target severity: `error` (default) or `warn`. |
| `--skip-preflight` | `escalate` | Patch without running ESLint first. |
| `--only` / `--exclude <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated include/exclude globs. |
| `--report <fmt>` | all | `json` or `md` to stdout. |

**Exit codes:** `0` OK · `1` logic error · `2` parse failure · `3` violations
in `--check` mode.

---

## 6. Conventions (follow these exactly)

- **Files/folders**: `kebab-case` (`remove-type-braces.ts`). **Exports**:
  `PascalCase` types/interfaces (no `I` prefix), `camelCase` functions/consts,
  `UPPER_SNAKE_CASE` only for module-level frozen config. Filename mirrors its
  primary export (`add-hyphen-separator.ts` → `addHyphenSeparator`).
- **Imports**: absolute `@/…` (never `../../`), ordered node-builtins → external
  → internal → type-only, alphabetized, `import type` for types.
- **TypeScript**: `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
  **No `any`. No non-null `!`.** Prove existence or handle `undefined`.
  `readonly` on shared data. Named exports only from library modules (default
  export is reserved for citty command definitions).
- **TSDoc-strict dogfooding**: every exported symbol has valid TSDoc.
  `tsdoc/syntax` and `tsdoc-require-2/require` run at **`error`** over `src/`
  (stricter than what the CLI ships to consumers). Barrels (`index.ts`) and
  `__tests__/` are exempt.
- **SRP / file size**: one module = one responsibility; a file over ~150 lines
  is a smell (command orchestrators are the pragmatic exception).
- **Commits**: Conventional Commits (`feat`/`fix`/`docs`/`refactor`/`test`/
  `chore`/`ci`), **no ticket prefix** (OSS), **no AI-attribution trailers**.
  Branches: `feature/<desc>` or `fix/<desc>`. One reviewable unit per commit.

---

## 7. Testing

- **Vitest**, colocated in `__tests__/` next to the code (`<module>.test.ts`).
- **Coverage gate**: ≥ 80% global (CI exit-fails below); transformer rules and
  the generator domain sit at ~100%.
- **Pure units** for rules/generators; **temp-dir integration** for anything
  touching the filesystem — build the fixture with `mkdtemp`, clean up in
  `afterEach`, never share mutable state.
- **Command tests** use the established pattern (see
  [`commands/__tests__/init.test.ts`](./src/commands/__tests__/init.test.ts)):
  a synthetic citty `CommandContext`, a `runHandler(cmd, args)` helper, and a
  `captureStdout` spy. Reset `process.exitCode` in `afterEach`.

**Quality gates (run before every push):**

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint . (includes the TSDoc dogfood)
npm run test           # vitest run   (npm run test:coverage for the gate)
npm run build          # unbuild → dist/  (+ CI asserts the <500 KB gzipped bound)
npm run check:tsdoc    # builds, then runs the CLI's own `check` over this repo
```

`npm run check` chains all of them.

---

## 8. Lessons learned

### From the real-world migrations (inform features)

- **Scaffolding missing docs is ~80% of the work** — the tool must _generate_
  stubs, not just convert. This is why `scaffold` is the highest-value pending command.
- `@module` is pervasive → `@packageDocumentation` (biggest single batch).
- `require-param`/`require-returns` produce hundreds of false positives on
  interfaces/types/consts → **keep them `off`**.
- `warn → error` progression is a first-class workflow, not a workaround. The
  only line that ever conflicts on long-lived branches is the rule severity.
- `tsdoc/syntax` is stricter than expected. Common breakers to handle: literal
  `{…}` in prose, `@pkg` / `@/alias` names, `>` in breadcrumbs, `@layer`/`@graph`,
  arrow fns and emails in un-fenced `@example`, `@param [x=1]` optional brackets,
  `@param obj.prop` dot notation, redundant `@property` blocks. (Full catalog in
  `PLAN.md` and the boilerplate's `TSDOC_IMPLEMENTATION_PLAN.md`.)

### From building the CLI (inform how to code here)

- **Idempotency must key on real intent, not substrings.** The ESLint patcher
  first no-op'd on _any_ `"eslint-plugin-tsdoc"` occurrence, which false-matched
  `eslint-plugin-tsdoc-require-2` and comments. Match an actual import/require.
- **Treat parsed JSON as hostile.** `mergeTsdocJson` must reject arrays/
  primitives and tolerate malformed `tagDefinitions` entries (`null`, missing
  `tagName`) without throwing.
- **Every advertised flag must be implemented.** `--report=md` was documented
  before it existed; keep flag surface and behavior in lockstep across commands.
- **Machine-readable fields should carry usable data**, not booleans whose name
  implies content (`eslintManualSnippet` now emits the snippet text or `null`).
- These all surfaced via **Copilot PR review** — see §9.

---

## 9. Working with pull requests & reviews

- Automated Copilot review is (being) wired via
  `.github/workflows/request-copilot-review.yml` to re-request on every push to
  an open PR. Until it lands on the default branch, request Copilot manually
  after pushing.
- When addressing review comments: fix + add a regression test, push, then
  **reply to each thread referencing the fixing commit** and **resolve the
  thread** (`resolveReviewThread` via GraphQL). Verify `0` unresolved before
  declaring done.
- Copilot may add "low confidence / suppressed" notes in the review body (not
  as threads) — still evaluate and address them.

---

## 10. Where to look

| Need | Start here |
|------|-----------|
| Add a JSDoc→TSDoc transform | `src/transformer/rules/` + register in `rules/index.ts` |
| Add/adjust a stub template or summary inference | `src/scaffolder/stub-builder.ts`, `src/scaffolder/name-inference.ts` |
| Change the preflight or the severity patch | `src/escalator/` |
| Change TSDoc validation or `tsdoc.json` loading | `src/validator/tsdoc-validator.ts` |
| Change what `check` reports | `src/commands/check-file.ts` |
| Change how exports reach the module surface | `src/scanner/export-inventory.ts` |
| Change how a declaration is classified (component/action/hook/…) | `src/scanner/declaration-classifier.ts` |
| Change what a statement contributes (names, params, type params) | `src/scanner/declaration-shape.ts` |
| Change stub placement or existing-doc detection | `src/scanner/insertion-location.ts` |
| Tag mapping tables | `src/parser/tag-registry.ts` |
| Comment line traversal / fence handling | `src/parser/comment-lines.ts` |
| Comment extraction / file discovery | `src/scanner/` |
| `init` building blocks | `src/generator/` |
| Comment-aware reading of flat-config text | `src/generator/config-source.ts` |
| Which TSDoc tags are standard vs custom | `src/generator/tsdoc-tags.ts` |
| Output formatting (diffs, tables, JSON/MD) | `src/reporter/` |
| Roadmap / scope / phases | `PLAN.md` |
```

---

## 11. Resuming work after a context reset (read this first)

This section is the handoff. When a session is compacted or a new one starts,
read §2, then this, and you have enough to continue without re-deriving the
state of the repo from its git history.

**Update it as the last step of every iteration**, together with `PLAN.md` and
`CHANGELOG.md`. An iteration is not finished until the decisions it produced are
written down here — the context that produced them is gone by the next session.

### The loop we follow

Develop locally → update **all** docs and `PLAN.md` → `/prepare-pr` →
`/create-github-pr` → address review, iterating until a review adds no new
comments → `/finalize-github-pr`. Then pick the next item and repeat.

The package is **not** declared ready to publish until it has been run end to
end against the real repositories the tool was designed from (see §8 and
`PLAN.md` → _Fixture Strategy_): `nextjs-boilerplate`, `homecare-nextjs`,
`assistedliving-nextjs`. Passing tests is not the bar; delivering real value on
a real codebase is.

### Next up

Remaining v0.1.0 scope, in the order that unblocks the most work. The full list
with checkboxes is `PLAN.md` → _In Scope (v0.1.0)_.

1. **`@property` → inline interface member docs** — the last structural
   transform. The redundant block is removed today; splitting it onto members
   is what remains.
2. **`convert --promote-line-comments`** — the `line-comments` topology it needs
   now exists, so `scan --classify` already reports exactly which files it
   would act on.
3. **Interactive mode** (`--interactive`, phase 7). `@clack/prompts` is already
   a dependency and is **not used anywhere** — either this lands or the
   dependency comes out, because today every consumer installs it for nothing.
4. **`--commit-per-file`** for reviewable PRs.
5. **Fixtures from the three real repos** (phase 9), then the end-to-end
   dogfood (phase 10), then publish (phase 11).

Done since this section was written: `scan --classify`, `--fail-on-missing`,
`--fail-on-stale` (PR #19).

---

## 12. Iteration log (decisions that outlive the context window)

Newest first. Each entry records what shipped and, more importantly, **the
non-obvious things** — a decision and its reasoning, or a trap that cost real
time. Skip the obvious; this is not a changelog (that is `CHANGELOG.md`).

### PR #19 — `scan --classify`, confidence levels and the gap gates

- **The trap the whole design is built around.** `readParameters` *invents* a
  name for a destructured binding (`props`, `options`, `argN`). Comparing
  documentation against it naively reports `@param title` on
  `function Card({ title, href }: CardProps)` as contradicting the signature —
  a false positive on the single most common shape in the codebases this tool
  targets. `ExportParameter.isSynthesized` now records the difference, and
  parameter staleness is **not judged at all** for such signatures.
- **Conservative beats complete, for a report.** A classification that flags
  accurate documentation gets ignored, and takes its true findings with it. The
  same reasoning suspends parameter *gaps* for destructured signatures once the
  comment documents any parameter, and skips `@param` judgement entirely on
  non-callable exports.
- **A file gets one bucket, and it must name the next action.** Severity is
  ordered by how much human input the fix needs — `stale` (someone must read
  it) > `no-docs` (invent prose, then review) > `line-comments` (prose exists,
  promote it) > `partial` > `valid` — rather than by how common a topology is.
- **Files that export nothing are counted apart.** Folding them into `valid`
  would overstate how much of a project is ready to convert. On this repo they
  were more than half the files before test paths were excluded.
- **Dogfooding caught the same class of bug as PR #17.** `scan --classify`
  reported a test helper as undocumented, which ESLint and `check` both exempt.
  Classification now excludes test paths by default (`--include-tests` opts in);
  the default `scan` inventory still keeps them, because `convert` does rewrite
  JSDoc in tests. When adding a command that judges *documentation coverage*,
  check whether `init`'s generated config already excuses the paths.
- **Review round 1 found two false verdicts, both confirmed by reproducing them.**
  The `@returns` gap check used a raw regex over the comment text instead of
  going through `mapCommentLines`, so an `@returns` inside an `@example` fence
  satisfied it and hid a real gap — a direct violation of the rule in §4.3.
  It now reads `getBlockTags`, which is already fence-aware and tested. And a
  run of `//` lines was classified as prose even when every line was a tooling
  directive, so `// eslint-disable-next-line` above an undocumented export read
  as "prose to promote". `LeadingComment` gained a `directive` kind for that;
  `hasLeadingDocComment` still keys on `doc` alone, so `scaffold`'s contract
  with the presence rule is untouched.
- **Round 2 added no threads but one suppressed note, which was right again.**
  The directive list enumerated `@ts-expect-error|ignore|nocheck` and so missed
  `@ts-check`, and it missed triple-slash directives entirely. Sweeping the
  class turned up `// #region` as well, which the note did not mention.
  Families are now matched by prefix (`@ts-[\w-]+`) rather than enumerated —
  listing members of a family is precisely how the gap appeared. **Always read
  the suppressed notes** (§9): they have now been the sharpest finding on two
  of the last three PRs.
- **Round 3 found a real one, and the spec settled it.** `documentedNames`
  scanned each line once from its start, so a single-line comment
  (`/** Adds. @param a - … @param b - … *\/`) yielded **no** tags at all — not
  just the first, as reported — and every parameter came back as an
  undocumented gap. Rather than argue about whether a mid-line tag counts,
  `@microsoft/tsdoc` was asked directly: it reads both params and the
  `@returns`. The readers now scan the whole line. `getBlockTags` was left
  alone — the conversion rules rewrite a line *by its leading tag*, which is a
  different question — and `getCommentTags` was added for "does this comment
  document X at all".
- **A cloud review found two the sweeps missed, both false positives.**
  (1) A hook recognized by its *name* but produced by a factory or bound to an
  alias (`export const useHash = createHook(defaults);`) reports no parameters,
  and "declares none" was treated as evidence — so every `@param` on it came
  back as contradicting the signature. `hasSignature` now separates "nothing
  was read" from "nothing is declared"; only the second is evidence.
  (2) TypeScript models an explicit `this` annotation as a parameter, so
  `readParameters` counted it. That was **not** confined to the classifier:
  `scaffold` was writing `@param this - TODO(tsdoc): describe this.` into real
  source, and `check` accepted it because the syntax is legal TSDoc. A shared
  reader means a defect in it is a defect in every command that reads it.
  Both had survived a deliberate hunt for false positives that probed generics,
  arrow consts, anonymous defaults and rest parameters — a reminder that the
  author is the worst person to audit their own blind spots.
- **A test that survives the revert is proving nothing.** The first version of
  the `this`-annotation test asserted through the classifier, where the
  destructuring guard suppressed the very difference it meant to pin; it passed
  against the broken build. Assert at the layer that owns the behaviour.
- **Validated against a pre-migration commit, not just the migrated repos.**
  The three real repos are already migrated, so they only measure the end
  state. `nextjs-boilerplate` at `b803d9c` (the parent of the migration merge)
  reports 55 valid / 7 partial / 13 no-docs against 67 / 8 / 0 after — the
  classification reproduces the work the migration actually did. Its blind spot
  is bounded and measured: 26 % of function-like exports destructure and have
  staleness suspended, leaving 67 declarations genuinely examined, so the zero
  stale findings are a real result rather than a silent no-op.
- **Settled a `PLAN.md` contradiction:** the gates live on `scan`, not `check`.
  `check` already exits `3` for undocumented exports, so `--fail-on-missing`
  there would be a no-op; `scan` is otherwise read-only and gains a CI role.
- **`isFunctionLikeKind` is now shared** with the scaffolder, so the two cannot
  disagree about which exports are supposed to carry `@param` / `@returns`.

### PR #18 — `@packageDocumentation` emitted once per comment

- **The bug no gate could catch.** `@fileoverview` and `@module` were each
  translated independently, so a comment carrying both was rewritten declaring
  the modifier **twice**. The TSDoc parser does not reject a duplicate modifier,
  so neither `check` nor `eslint-plugin-tsdoc` would ever report it. Only
  reading the output found it.
- **How it was found, and what that says about the transformer.** Running the
  rule pipeline over ~25 adversarial JSDoc inputs and diffing the
  `@microsoft/tsdoc` parse of each comment *before vs. after* conversion found
  **zero** introduced violations. The transformer is sound. That is also why the
  deferred "validate each converted comment before writing it" idea looks weak:
  a guard with no demonstrable trigger, whose tests could only assert a no-op.
- **A substring pre-filter next to a regex is a drift hazard.** The pre-check
  that skips the pre-existence scan fails *open* into the exact duplicate-tag
  bug being fixed, so the regex is built from the tag constant and the two
  cannot disagree.
- **Measure before accepting a performance note.** The reported "measurable
  per-comment overhead" was real but ≈1% of `convert`'s work: 0.33 ms of extra
  traversal against a 4.66 ms rule pipeline inside a ~25 ms run over 94 files.
  TypeScript comment extraction dominates everything else.

### PR #17 — `check` command (phase 6)

- **`TSDocConfigFile.loadForFolder` is the wrong door.** It walks up until it
  meets a `package.json`/`tsconfig.json` and only then looks for `tsdoc.json`;
  failing that it reports `hasErrors` with "File not found". Using it made
  **every project without a `tsdoc.json` exit 2** — the normal state before
  `init` runs. Probing `<cwd>/tsdoc.json` directly keeps "no config yet" apart
  from "broken config". `extends` still resolves, because `loadFile` handles it.
- **`stat` succeeds on a file the process cannot read.** So EACCES surfaces
  inside `loadFile`, which *throws* — escaping as exit `1` instead of the
  documented exit `2`. The only way to make `stat` itself fail is a parent
  directory without execute permission; that is what the regression test uses.
- **Shared constants beat parallel logic.** `check` was reporting test files
  that the ESLint config `init` generates exempts — the product contradicting
  itself. `TEST_FILE_GLOBS` is now one constant used by both.
- **Ask the other command instead of re-deriving.** Whether a file still holds
  legacy JSDoc is decided by asking `convert` if it would rewrite it, so the two
  cannot drift on what "converted" means.

### PR #16 — `escalate` + preflight (phase 8)

- **Never lint with an injected config.** The preflight resolves the *target
  project's* ESLint and runs it with the project's own configuration — no
  `overrideConfig`. Anything else manufactures violations the user's pipeline
  would never report, and the verdict has to equal CI's to be worth anything.
- **Preflight runs for `warn` targets too**, because pipelines using
  `--max-warnings 0` break on an `off → warn` change just as hard.
- **Text-patching a flat config must ignore comments.** A regex matched the rule
  *inside a comment*, so `escalate` reported `"warn" → "error"` over a config it
  had not touched — a false pass. Fixed with a character-level, length-preserving
  comment mask (`src/generator/config-source.ts`); offsets stay interchangeable
  with the original text. Known limit: regex literals are not tokenized, so `//`
  inside one masks the rest of the line — it fails closed.
- **Count, do not flag.** "Rule is disabled everywhere" was reported for a config
  that mixed `off` with an unparseable key, sending the user after the wrong
  problem. Counting rule keys separates "disabled" from "unreadable".

### Process lessons (apply to every iteration)

- **Verify every review claim empirically before acting on it.** Twice a claim
  turned out to understate the problem, and once the accurate finding was the
  one Copilot filed as *low confidence* in the review body rather than as a
  thread. Read those too (§9).
- **Prove the net bites.** After fixing, reintroduce the bug and confirm the new
  tests fail. On PR #17 this caught a real hole: the first regression test
  covered only one of the two code paths and passed against the broken build.
- **Sweep for the defect class, not the reported instance.** The comment-mask
  fix surfaced a second case the review never mentioned — one that an existing
  test had pinned as *correct*.
- **The GitHub reviews API misleads in two specific ways.** It is paginated
  (`--paginate` is required), and your own replies are recorded as reviews by
  the repo owner with empty bodies — so a poll must filter on author **and**
  commit. Also: Copilot reviews the commit that was head when it ran; pushing
  afterwards does **not** re-trigger it, you must re-request explicitly.
