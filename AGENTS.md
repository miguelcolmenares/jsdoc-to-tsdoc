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
| `scan`    | **shipped**  | Read-only inventory of what `convert` would change. |
| `convert` | **shipped**  | Transforms existing JSDoc comments into TSDoc syntax (10-rule pipeline). |
| `scaffold`| **shipped**  | Generates TSDoc stubs for undocumented exports (the ~80% of real-world work). |
| `escalate`| _planned_    | Bump `tsdoc-require-2/require` from `warn` → `error` with a preflight check. |
| `check`   | _planned_    | Standalone CI validation (today `convert --check` / `scaffold --check` cover "would change"). |

Domains present: `parser`, `scanner`, `transformer`, `scaffolder`, `generator`,
`reporter`, `writer`, `commands`. See `PLAN.md` → _Implementation Status_ for the
running tally and `PLAN.md` → _Development Roadmap_ for phase order.

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
├── reporter/            # colored diffs, tables, JSON/Markdown output, ANSI colors
└── writer/              # async file writes
```

**Data-flow of a `convert`:** `scanner.extractJsDocComments` (via
`ts.getLeadingCommentRanges`) → for each comment `transformer.runPipeline`
(ordered rules over the comment text) → `scanner.applyEdits` (splices replacements
from highest offset down) → `writer` or `reporter`. The shared orchestrator is
[`src/commands/convert-file.ts`](./src/commands/convert-file.ts) (pure, no I/O),
reused by both `scan` (counting) and `convert` (writing).

**Data-flow of a `scaffold`:** `scanner.collectExportedDeclarations` (via the TS
compiler API — classifies each export, records its insertion offset and indent,
flags existing docs) → `scanner.undocumentedDeclarations` → for each,
`scaffolder.buildStub` (name inference + per-kind template) → `scanner.applyEdits`
(zero-width insertions, spliced highest-offset-first) → `writer` or `reporter`.
The shared orchestrator is [`src/commands/scaffold-file.ts`](./src/commands/scaffold-file.ts)
(pure, no I/O). Re-exports are skipped; a second run is a no-op (idempotent).

**Data-flow of an `init`:** `generator.detectProject` (layout) +
`generator.collectProjectTags` (classify tags) → `generator.generateTsdocJson`/
`mergeTsdocJson` + `generator.patchEslintFlatConfig` → `reporter` diffs or
`writer`. See [`src/commands/init.ts`](./src/commands/init.ts).

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
```

| Flag | Commands | Purpose |
|------|----------|---------|
| `--cwd <dir>` | all | Project directory (default `.`). |
| `--dry-run` / `--preview` | `init`, `convert`, `scaffold` | Show a diff; write nothing. |
| `--strict` | `init` | Start the presence rule at `error` instead of `warn`. |
| `--install` | `init` | Run the detected package manager to install missing dev deps. |
| `--check` | `convert`, `scaffold` | CI mode — exit `3` if anything would change; never writes. |
| `--lite` | `scan`, `convert` | Only `@param`/`@returns` hygiene (`Rule.liteSafe`). |
| `--only` / `--exclude <globs>` | all | Comma-separated include/exclude globs. |
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
```

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
| Change how exports are detected or classified | `src/scanner/export-inventory.ts` |
| Tag mapping tables | `src/parser/tag-registry.ts` |
| Comment line traversal / fence handling | `src/parser/comment-lines.ts` |
| Comment extraction / file discovery | `src/scanner/` |
| `init` building blocks | `src/generator/` |
| Which TSDoc tags are standard vs custom | `src/generator/tsdoc-tags.ts` |
| Output formatting (diffs, tables, JSON/MD) | `src/reporter/` |
| Roadmap / scope / phases | `PLAN.md` |
```
