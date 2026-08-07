# jsdoc-to-tsdoc — Project Plan

> **Revision:** v2 — Updated with learnings from three real-world migrations
> (`nextjs-boilerplate`, `homecare-nextjs`, `assistedliving-nextjs`; ~87 files
> across 3 repos, July 2026).
>
> **Implementation status (v0.1.0-dev):** the whole
> `init → convert → scaffold → escalate` workflow is implemented, tested, and
> runnable; the `check` CI gate validates the result against the official TSDoc
> parser, and `scan --classify` reports where a project actually stands before
> any of it runs. See [Implementation Status](#implementation-status) below.

## Implementation Status

Sixth development increment — the project foundation, the `convert`/`scan`
vertical slice, the `init` bootstrap command, the `scaffold` stub generator
(the ~80 % of real-world migration work identified in the learnings), the
`escalate` lock-in step that closes the workflow, the `check` CI gate that
validates the result, and the `classifier` domain behind `scan --classify` that
reports what a project's documentation actually looks like before any of it
runs. Every subcommand in the CLI contract now exists. All quality gates pass
locally (typecheck, lint, tests, build, bundle size), and the CLI now gates its
own source with its own `check` command.

### Shipped

| Area | Detail |
| ------ | -------- |
| **Foundation** | ESM package (`bin: jsdoc-to-tsdoc`), TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, `@/` path alias, unbuild bundling, Vitest, CI matrix (Node 20.19 + 22 + 24 · Ubuntu + macOS + Windows) with a gzipped bundle-size gate |
| **Dogfooding** | ESLint flat config runs `tsdoc/syntax` + `tsdoc-require-2/require` at `error` over the CLI's own source (`require-param` / `require-returns` `off`, matching the learnings) |
| **`parser`** | `comment-lines` (fence-aware, format-preserving line mapper), `tag-registry` (the full JSDoc → TSDoc mapping tables), `jsdoc-parser` (tag/brace inspection) |
| **`transformer`** | 13 pure, deterministic rules + an ordered pipeline with `--lite` (`@param` / `@returns` hygiene) mode |
| **`scanner`** | comment extraction via the TypeScript Compiler API (`ts.getLeadingCommentRanges`), recursive source-file discovery, minimal glob matching for `--only` / `--exclude`, and `export-inventory` (classifies each export, records its stub insertion point, flags whether it is already documented, skips re-exports) |
| **`scaffolder`** | deterministic summary inference from identifier names (verb conjugation, predicates, acronym/kebab/snake splitting) and TSDoc stub rendering per export kind; every stub carries a `TODO(tsdoc)` review marker |
| **`generator`** | project-layout detection (ESLint flat config, `tsconfig`, package manager, installed deps), custom-tag classification against the TSDoc standard, `tsdoc.json` generation/merging, comment-aware reading of flat-config text, and idempotent ESLint flat-config patching |
| **`validator`** | doc-comment validation against the official `@microsoft/tsdoc` parser, configured from the project's own `tsdoc.json` so custom tags (`@since`) are not reported as undefined |
| **`escalator`** | preflight lint run (resolves and runs the *project's own* ESLint with the *project's own* config, collecting every presence-rule message whatever its severity) and a text patch of the rule's severity that only rewrites enabled assignments |
| **`classifier`** | per-export documentation topology (valid / partial / line-comments / no-docs / stale), conservative stale detection that never judges a destructured signature, and aggregation to one verdict plus a confidence level per file |
| **`reporter`** | colored unified diffs, bordered summary tables, and machine-readable JSON / Markdown output |
| **`prompter`** | interactive per-file review (`--interactive`): a pure accept/skip/edit/quit orchestrator wired to a lazy `@clack/prompts` adapter and an `$EDITOR` launcher |
| **`writer`** | async file writes |
| **`commands`** | `init` (`tsdoc.json` + ESLint patch, `--dry-run` / `--strict` / `--install` / `--report`), `scan` (read-only inventory, plus `--classify` / `--fail-on-missing` / `--fail-on-stale` / `--include-tests`), `convert` (`--dry-run` / `--preview` / `--check` / `--lite` / `--interactive` / `--only` / `--exclude` / `--report`), `scaffold` (`--dry-run` / `--preview` / `--check` / `--interactive` / `--only` / `--exclude` / `--report`), `escalate` (`--dry-run` / `--preview` / `--check` / `--severity` / `--skip-preflight` / `--report`), and `check` (`--syntax-only` / `--include-tests` / `--only` / `--exclude` / `--report`) wired through citty |

Conversions implemented (from [Mechanical Transformations](#mechanical-transformations-still-core-to-the-tool)
and the real-world learnings): `{Type}`-brace stripping, tag renames
(`@return` → `@returns`, `@template` → `@typeParam`, `@default` → `@defaultValue`),
`@returns Promise<T>` unwrapping, JSDoc optional-bracket removal, the mandatory
`@param name - desc` hyphen, `@access` → visibility modifiers,
`@module` / `@fileoverview` → `@packageDocumentation`, removal of
TypeScript-redundant and JSDoc-only tags (`@function`, `@async`, `@typedef`, …),
and relocation of `@property` descriptions onto the members they document.
Beyond the tag rewrites, `convert` also repairs prose that TSDoc would misparse:
it fences an unfenced `@example` body that carries a hazard (`{`, `<`, `>`, or a
bare `@`), backticks a bare `@` in prose (path aliases, scoped packages,
decorators), and folds a dotted `@param parent.child` into its parent's
description as a lossless `(child: description, …)` list. Fenced example code is
otherwise never modified.

Stubs generated (per export kind): React components, Server Actions (detected by
the `(prevState, formData)` signature), hooks (`useX`), interfaces, type aliases,
classes, enums, plain functions, and variables. Re-export statements are skipped
— the symbol is documented at its definition site. Stub tag order follows the
TSDoc convention (summary, `@remarks`, `@typeParam`/`@param`, `@returns`), and
the generated output is itself valid under `tsdoc/syntax` and satisfies
`tsdoc-require-2/require`.

Escalation is gated on a preflight that runs the project's real ESLint against
its real config, so the verdict matches what CI will do: every `off` the project
configured (the `__tests__/` exemption `init` writes, most commonly) is honoured
rather than overridden, and the patch itself never enables a disabled assignment
nor touches the `require-param` / `require-returns` siblings.

`check` is the only command that validates rather than transforms. It defers to
`@microsoft/tsdoc` itself — the parser `eslint-plugin-tsdoc` runs — so a clean
`check` predicts a clean lint, and it reports three categories: invalid syntax,
exports with no documentation, and comments still holding JSDoc that `convert`
would rewrite. Test paths are skipped by default because the config `init`
generates disables both TSDoc rules for them, and a broken `tsdoc.json` exits `2`
rather than reporting every custom tag as undefined. The CLI gates its own source
with it (`npm run check:tsdoc`).

Classification is deliberately conservative, because a report that cries wolf
about accurate documentation gets ignored and takes its true findings with it.
The load-bearing case: the scanner invents a name for a destructured parameter
(`props`, `options`, `argN`), so comparing `@param title` against it would
report correct documentation on nearly every React component as stale. Parameter
staleness is therefore not judged at all for destructured signatures, and
parameter gaps only once such a comment documents no parameter whatsoever.

Coverage: 629 tests, ~95.7 % overall — 100 % on the classifier and validator,
~99 % on the generator and scaffolder, and ~95–98 % across the transformer
rules, parser, scanner, and escalator.

### Deferred (next increments)

- Trim the blank content line a removed tag block can leave behind before the
  closing `*/`. Valid TSDoc, but untidy output the tool writes into user files.
- `--commit-per-file`.
- Reuse the `@microsoft/tsdoc` validation pass inside `convert`, so a
  transformed comment is proven valid before it is written.
- Fixture-based snapshot tests seeded from the three real migrations.
- **Agent customization (next iteration):** flesh out the `.github/copilot-instructions.md`
  TODO into path-specific `.github/instructions/*.instructions.md` files
  (architecture, documentation, testing, reviews) and reusable `.github/skills/`
  for the recurring tasks (add a transformer rule, a scaffolder template, a CLI
  subcommand). Groundwork already shipped: [`AGENTS.md`](./AGENTS.md) and
  `.github/copilot-instructions.md`.

## Gap Analysis

### What Exists Today (July 2026)

#### Microsoft Official Ecosystem (strong)

| Package | Weekly Downloads | Role |
| --------- | ----------------- | ------ |
| `@microsoft/tsdoc` | 49M | Core parser — reads and validates TSDoc comments |
| `@microsoft/tsdoc-config` | 23.8M | Loads `tsdoc.json` (custom tags like `@since`) |
| `eslint-plugin-tsdoc` | 4.3M | ESLint rule that validates syntax (`tsdoc/syntax`) |
| `@microsoft/api-extractor` | 19.5M | Full API surface review, `.d.ts` rollups, doc output |

#### Enforcement / Linting (good, growing)

| Package | Weekly Downloads | Role |
| --------- | ----------------- | ------ |
| `eslint-plugin-tsdoc-require-2` | 1.3K | Enforces that exports have TSDoc + specific tags |
| `@guardian/eslint-plugin-tsdoc-required` | 1.2K | Basic export comment enforcement |

#### Documentation Generation (good)

| Package | Weekly Downloads | Role |
| --------- | ----------------- | ------ |
| TypeDoc | Standard | HTML/JSON API docs from TSDoc |
| `tsdoc-markdown` | 8.8K | Markdown generation from TSDoc |

#### VS Code Extensions (weak / dead)

| Extension | Installs | Status |
| ----------- | ---------- | -------- |
| TSDoc Comment (kingsimba) | 9.7K | Last commit 5 years ago. Converts `//` to `/** */`. |
| tsDoc (jlsilva) | 3.2K | v0.0.1, empty shell. |
| TSDoc Generator (1yoouoo) | 757 | Requires ChatGPT API key, interfaces/types only. |
| tsdoc-insert (Topppy) | 460 | Minimal, unmaintained. |
| tsdoc-gen (vicius) | 281 | Barely used. |

### The Gap: No End-to-End Migration Workflow

The individual pieces exist (parser, syntax linter, presence linter), but **no
tool orchestrates the full migration workflow** we consistently did by hand
across three repositories:

1. **Bootstrap** — install two ESLint plugins, patch `eslint.config.mjs`,
   create a `tsdoc.json` with the project's custom tags (`@since`, `@author`, …).
2. **Convert** — transform existing JSDoc comments (`{types}`, `@typedef`,
   `@fileoverview`, etc.) into TSDoc-compliant syntax.
3. **Scaffold** — generate TSDoc stubs for **every export that has none**
   (this was the majority of the work — see [Real-World Learnings](#real-world-learnings)).
4. **Escalate** — bump the presence rule from `"warn"` to `"error"` in a
   final commit, locking the codebase in.

The syntactic conversion is one part of the job; the scaffolding and enforcement
progression are the other two. All three must ship together to be useful.

### Mechanical Transformations (still core to the tool)

| JSDoc Pattern | TSDoc Equivalent | Automation Complexity |
| --------------- | ----------------- | ---------------------- |
| `@param {string} name Description` | `@param name - Description` | Simple — regex/AST strip |
| `@returns {boolean} Description` | `@returns Description` | Simple — regex/AST strip |
| `@fileoverview Description` | `@packageDocumentation` + summary paragraph | Medium — restructure |
| `@module ModuleName` | `@packageDocumentation` | Simple — tag swap |
| `@typedef {Object} MyType` | Remove entirely | Simple — delete |
| `@callback MyCallback` | Remove entirely | Simple — delete |
| `@type {Type}` | Remove entirely | Simple — delete |
| `@property {string} name` | Inline `/** comment */` on the member (`interface` or `type` over an object literal), or a prose list item when there is no member | Medium — structural (**shipped**) |
| `@function`, `@async`, `@class` | Remove entirely | Simple — delete |
| `@enum {string}` | Remove entirely | Simple — delete |
| `@fires`, `@emits` | Not in TSDoc standard | Medium — decide policy |
| `@access private` | `@internal` or remove | Simple — tag swap |
| `@augments`/`@extends` | Remove (TS `extends` keyword) | Simple — delete |
| `@implements` | Remove (TS `implements` keyword) | Simple — delete |
| Multi-paragraph descriptions | Split into summary + `@remarks` | Medium — heuristic |
| `@todo` | Not in TSDoc standard | Define as custom tag or remove |

---

## Real-World Learnings

Data from the three completed migrations that inform this plan.

### Migration Scope by Repo

| Repo | JSDoc conversions | **New TSDoc stubs added** | Total files touched | ESLint plugins added |
| ------ | ------------------- | --------------------------- | --------------------- | ---------------------- |
| `nextjs-boilerplate` | ~5 | 14 | 14 | `tsdoc` + `tsdoc-require-2` |
| `homecare-nextjs` | ~8 | 26 | 26 | same |
| `assistedliving-nextjs` | ~10 | 47 | 47 | same |
| **Total** | ~23 | **87** | 87 | — |

**Key insight:** scaffolding missing TSDoc was ~80 % of the work. The tool
must generate stubs, not just convert existing comments.

### ESLint Rule Configuration Gotchas

`eslint-plugin-tsdoc-require-2` ships three rules. Only one is usable in
practice across a real Next.js codebase:

```js
"tsdoc-require-2/require":         "warn",   // ✅ enforce presence on exports
"tsdoc-require-2/require-param":   "off",    // ❌ false positives on interfaces/types/constants
"tsdoc-require-2/require-returns": "off",    // ❌ false positives on interfaces/types/constants
```

The CLI's `init` command must scaffold this exact configuration by default —
turning on `require-param`/`require-returns` produces hundreds of false
positives that block adoption.

### Progressive Enforcement Pattern

The workflow that consistently succeeded:

| Phase | Rule severity | Commit type |
| ------- | --------------- | ------------- |
| 1. Bootstrap + convert | `"warn"` | `chore: add tsdoc plugins and convert existing JSDoc` |
| 2. Fix / scaffold missing | `"warn"` | `docs: add missing TSDoc for exports` |
| 3. Lock in | `"error"` | `chore: escalate tsdoc-require to error` |

Attempting to introduce the rule as `"error"` upfront blocks CI on day one
and stalls the migration. The `warn → error` split is a first-class workflow,
not a workaround — the CLI must support both `init --progressive` (default)
and `init --strict`.

### Rebase Conflict Pattern

When a `feature/tsdoc-migration` PR lives for several days and intermediate
commits get merged into `dev`, the only line that consistently conflicts is
the ESLint config rule severity:

```diff
- "tsdoc-require-2/require": "warn"
+ "tsdoc-require-2/require": "error"
```

Predictable enough that `escalate` should default to a one-line change that
is trivial to auto-resolve with `git rerere` or the tool itself.

### Next.js / React Patterns (the majority of stubs)

The scaffolding step must recognize these idioms — they made up ~80 % of the
87 new stubs we wrote:

| Export shape | Stub template |
| -------------- | -------------- |
| `export default function ComponentName({...}: Props)` | Summary derived from name + `@param props - Component props` |
| `export function actionName(prevState, formData)` (Server Action) | Summary "Server Action …" + per-param docs |
| `export interface XProps` | Header + inline `/** */` per field |
| `export const useX = ...` (custom hook) | Summary derived from name + `@returns` |
| `export const X = ...` (arrow fn / object) | Summary inferred from name |
| `export type X = ...` | Summary only |
| `export { X } from '...'` (re-export) | **Skip** — no stub needed |

### Custom Tags Detected in Practice

Across the three repos: `@since` (dominant), `@author`, `@example`, `@remarks`,
`@internal`. All are already valid TSDoc block or modifier tags — the only
`tsdoc.json` work is registering `@since` as a custom block tag.

---

## Architecture Plan

### CLI Flow — Subcommand Model

Instead of a single monolithic flow, the CLI exposes verbs that mirror the
four-step workflow. Each is independently runnable so users can adopt
incrementally (or re-run one phase after edits).

```bash
$ npx jsdoc-to-tsdoc <command> [options]

Commands:
  init         Bootstrap ESLint plugins + tsdoc.json (rule=warn by default)
  scan         Inventory report: what convert/scaffold will touch (no writes)
  convert      Transform existing JSDoc → TSDoc syntax
  scaffold     Generate TSDoc stubs for exports without documentation
  escalate     Bump tsdoc-require-2/require from "warn" to "error"
  check        CI-friendly: exit 3 if any file would change / rule violations remain

Global options:
  --dry-run          Show diff, do not write
  --interactive      Prompt for ambiguous decisions (default: on for scaffold)
  --config <path>    Path to eslint.config (auto-detected by default)
  --report <fmt>     Report format: json | md | table (writes to stdout; redirect with `>`)
```

### Example: `init`

```bash
$ npx jsdoc-to-tsdoc init

  jsdoc-to-tsdoc v0.1.0 · init

  Scanning project...
  ✓ tsconfig.json found (src/ base)
  ✓ eslint.config.mjs found (flat config)
  ✓ package manager: npm

  Detected custom tags in comments:
    @since (34 occurrences)   → will register in tsdoc.json
    @author (12 occurrences)  → already a standard TSDoc tag
    @todo (8 occurrences)     → ? register / remove / leave

  ? How should we handle @todo? (Use arrow keys)
  ❯ Add to tsdoc.json as custom block tag
    Remove during convert step
    Skip (leaves them as-is)

  Will install:
    eslint-plugin-tsdoc@^0.4
    eslint-plugin-tsdoc-require-2@^1

  Will patch eslint.config.mjs:
    + import tsdocPlugin from "eslint-plugin-tsdoc";
    + import tsdocRequire from "eslint-plugin-tsdoc-require-2";
    ...
    + rules: {
    +   "tsdoc/syntax": "warn",
    +   "tsdoc-require-2/require": "warn",     ← starts at warn
    +   "tsdoc-require-2/require-param": "off", ← known false positives
    +   "tsdoc-require-2/require-returns": "off",
    + }

  Will create tsdoc.json:
    {
      "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
      "tagDefinitions": [
        { "tagName": "@since", "syntaxKind": "block" }
      ]
    }

  ? Apply changes? (y/N)
```

### Example: `scan`

```bash
$ npx jsdoc-to-tsdoc scan

  jsdoc-to-tsdoc v0.1.0 · scan

  ┌────────────────────────────────────────┬────────────┐
  │ Category                               │ Count      │
  ├────────────────────────────────────────┼────────────┤
  │ Files with JSDoc to convert            │ 23         │
  │ Exports without any TSDoc              │ 87         │
  │   └─ React components                  │ 34         │
  │   └─ Server Actions                    │ 12         │
  │   └─ Interfaces/types                  │ 21         │
  │   └─ Other named exports               │ 20         │
  │ Files with re-exports only (skip)      │ 8          │
  ├────────────────────────────────────────┼────────────┤
  │ Total files to modify                  │ 110        │
  └────────────────────────────────────────┴────────────┘

  Run `jsdoc-to-tsdoc convert` first, then `scaffold`, then `escalate`.
```

### Example: `escalate`

```bash
$ npx jsdoc-to-tsdoc escalate

  jsdoc-to-tsdoc v0.1.0 · escalate

  ✓ Running `eslint --rule 'tsdoc-require-2/require: error'` in check mode...
  ✓ 0 errors, 0 warnings

  Will patch eslint.config.mjs:
  -   "tsdoc-require-2/require": "warn"
  +   "tsdoc-require-2/require": "error"

  ? Apply and stage for commit? (y/N)
```

### Core Modules

Folders are DDD-lite domains; filenames follow the kebab-case rule defined in
[Code Architecture & Standards](#code-architecture--standards). Each domain
folder ships a barrel `index.ts` that re-exports its public API — internal
files are private and can be renamed without breaking consumers.

```text
src/
├── cli.ts                            # citty entry point + subcommand dispatch
├── commands/                         # One file per subcommand (citty default export)
│   ├── init.ts
│   ├── scan.ts
│   ├── convert.ts
│   ├── scaffold.ts
│   ├── escalate.ts
│   ├── check.ts
│   └── index.ts                      # Barrel
├── scanner/
│   ├── project-scanner.ts            # Find TS files, detect config
│   ├── comment-extractor.ts          # ts.getLeadingCommentRanges() based extraction
│   ├── export-inventory.ts           # Enumerate exported declarations lacking TSDoc
│   ├── __tests__/
│   └── index.ts                      # Barrel: exports scanProject, extractComments, ...
├── parser/
│   ├── jsdoc-parser.ts               # Parse JSDoc tags from comment text
│   ├── tag-registry.ts               # JSDoc → TSDoc tag mapping (readonly)
│   ├── __tests__/
│   └── index.ts
├── transformer/
│   ├── pipeline.ts                   # Rule composition (private)
│   ├── rules/
│   │   ├── remove-type-braces.ts
│   │   ├── add-hyphen-separator.ts
│   │   ├── convert-file-overview.ts
│   │   ├── remove-redundant-tags.ts
│   │   ├── remove-jsdoc-only-tags.ts # @typedef/@callback/@type; resolves @property
│   │   ├── convert-access-tags.ts
│   │   ├── split-remarks.ts
│   │   ├── __tests__/
│   │   └── index.ts                  # Barrel: re-exports every rule
│   ├── __tests__/
│   └── index.ts                      # Barrel: runPipeline, type Rule
├── scaffolder/
│   ├── templates/
│   │   ├── react-component.ts        # export default function → props docs
│   │   ├── server-action.ts          # (prevState, formData) → param docs
│   │   ├── hook.ts                   # useX → return docs
│   │   ├── interface.ts              # per-field inline docs
│   │   ├── type-alias.ts
│   │   ├── generic.ts                # fallback for arbitrary exports
│   │   ├── __tests__/
│   │   └── index.ts                  # Barrel
│   ├── name-inference.ts             # kebab/camelCase → prose summary
│   ├── __tests__/
│   └── index.ts
├── generator/
│   ├── tsdoc-json-generator.ts       # from detected custom tags
│   ├── eslint-config-patcher.ts      # patches flat config
│   ├── __tests__/
│   └── index.ts
├── escalator/
│   ├── rule-updater.ts               # warn → error patch
│   ├── preflight-check.ts            # verify 0 warnings before escalating
│   ├── __tests__/
│   └── index.ts
├── validator/
│   ├── tsdoc-validator.ts            # official @microsoft/tsdoc parse + tsdoc.json
│   ├── __tests__/
│   └── index.ts
├── reporter/
│   ├── dry-run-reporter.ts
│   ├── json-reporter.ts              # machine-readable output for CI
│   ├── summary-reporter.ts
│   ├── __tests__/
│   └── index.ts
└── writer/
    ├── file-writer.ts
    ├── __tests__/
    └── index.ts
```

> **Naming rule.** Filenames are kebab-case (`remove-type-braces.ts`); the
> exports they contain remain camelCase / PascalCase (`removeTypeBraces`,
> `TransformerContext`). See
> [File & Identifier Naming](#file--identifier-naming) for the full contract.

### Key Design Decisions

1. **Use `@microsoft/tsdoc` parser for validation** — after transforming, parse
   the result with the official parser to guarantee validity.
2. **Use TypeScript Compiler API for comment extraction and export detection**
   — `ts.getLeadingCommentRanges()` and `ts.SymbolTable` give precise positions
   without regex fragility.
3. **Rule-based pipeline** — each transformation is an independent rule that
   can be toggled on/off.
4. **Subcommand model, not a single flow** — matches the real 4-step workflow;
   users can re-run any phase.
5. **`init` defaults to progressive (`warn`) mode** — matches the pattern that
   worked in three consecutive migrations; `--strict` opts into `error` upfront.
6. **`require-param` / `require-returns` disabled by default** — they generate
   false positives on interfaces, type aliases, and const exports.
7. **Non-destructive by default** — every command supports `--dry-run` and
   shows a unified diff before applying.
8. **Preserves formatting** — only modify comment content, never surrounding
   code layout.
9. **No LLM dependency in v0.1.0** — deterministic templates and name inference.
   LLM-assisted summary rewriting is a v0.2+ opt-in flag.
10. **Machine-readable output** — every command supports `--report=<fmt>` (`json` /
    `md` / `table`) written to stdout, enabling GitHub Actions / Bitbucket
    Pipelines integrations (redirect with `> report.json`).

### Technology Stack

- **Language**: TypeScript
- **CLI framework**: **`citty`** (UnJS) — first-class subcommand support
- **TS Compiler API**: For AST traversal, comment extraction, export enumeration
- **`@microsoft/tsdoc`** + **`@microsoft/tsdoc-config`**: Validation + `tsdoc.json` generation
- **`eslint`** (peer): For `escalate --preflight` and `check`
- **`@clack/prompts`**: Interactive wizard (nicer defaults than inquirer)
- **`diff`**: Unified diffs in dry-run mode
- **Testing**: Vitest with snapshot tests seeded from real repo fixtures
  (see [Fixture Strategy](#fixture-strategy))

---

## CLI UX & Distribution

This section covers three orthogonal concerns that shape the day-one user
experience: how the CLI ships (`npx`), what operational modes it exposes
(dry-run, preview, interactive, check), and how it handles the messy reality
of real-world codebases (non-standard comments, missing docs, stale docs).

### Distribution via `npx`

The tool must be runnable as `npx jsdoc-to-tsdoc <command>` with **zero global
install**. This drives several packaging decisions.

**`package.json` shape:**

```json
{
  "name": "jsdoc-to-tsdoc",
  "type": "module",
  "bin": { "jsdoc-to-tsdoc": "./dist/cli.mjs" },
  "engines": { "node": ">=20.19" },
  "peerDependencies": { "typescript": ">=5.0" }
}
```

The entry file `dist/cli.mjs` must start with `#!/usr/bin/env node`.

**Packaging constraints:**

| Concern | Decision |
| --------- | ---------- |
| **Bundler** | `unbuild` or `tsup` — outputs ESM (+ CJS if needed), tree-shakes, single file |
| **Bundle size target** | **< 500 KB gzipped** (npx re-downloads on cache miss) |
| **TypeScript as peer** | The user already has it — never bundle the ~50 MB compiler |
| **Startup time** | Lazy-import `typescript`, `@microsoft/tsdoc`, `@clack/prompts` inside subcommand handlers; `citty` parses `argv` first |
| **Module format** | ESM only (Node 20+ handles it natively; avoids dual-package hazard) |
| **Zero-config init** | `npx jsdoc-to-tsdoc init` must succeed on any TS project without flags |
| **Exit codes** | `0` OK · `1` logic error · `2` parse failure · `3` violations in `--check` mode (CI-friendly) |
| **Version pinning in CI** | Publish under semver; recommend `npx jsdoc-to-tsdoc@0.1` in docs to prevent surprise upgrades |

**Peer dependency for ESLint plugin:**

`eslint-plugin-tsdoc-require-2` is declared as a peer dep and installed by
`init` when it detects an ESLint config. This keeps the tool's own footprint
small while still enabling the auto-patch workflow.

### Operational Modes

Beyond the built-in `--dry-run` semantics of `scan`, every mutating command
exposes a consistent set of flags:

| Flag | Applies to | Purpose |
| ------ | ----------- | --------- |
| `--preview` | `convert`, `scaffold` | Print colored unified diff per file, do not write |
| `--interactive` | `convert`, `scaffold` | Prompt per file: **a**ccept · **s**kip · **e**dit · **q**uit |
| `--check` | `convert`, `escalate` | CI mode — exit `3` if any file would change (mirrors `prettier --check`) |
| `--lite` | `convert` | Only touch `@param` / `@returns`; leave `@example`, `@remarks`, custom tags untouched |
| `--only <glob>` | all | Restrict to matching paths (e.g. `--only "src/actions/**"`) |
| `--exclude <glob>` | all | Skip matching paths (e.g. `--exclude "**/*.test.ts"`) |
| `--commit-per-file` | `convert`, `scaffold` | Auto `git commit` per file — produces reviewable PRs |
| `--report=<fmt>` | `scan`, `check`, `convert` | `json` · `md` · `table` — written to stdout (redirect with `>` for tooling / PR bodies) |
| `--fail-on-missing` | `scan` | Exit `3` if any public export lacks TSDoc — gap-analysis gate (matches CI exit-code contract) |
| `--fail-on-stale` | `scan` | Exit `3` if any comment contradicts its signature |
| `--classify` | `scan` | Report documentation topology and confidence instead of the conversion inventory |
| `--severity=<level>` | `escalate` | Override progressive default (`warn` or `error`) |

**Example CI flow:**

```bash
# Gate the migration itself.
npx jsdoc-to-tsdoc check --report=json > tsdoc-report.json
# Gate the documentation gap separately — the confidence gates live on `scan`.
npx jsdoc-to-tsdoc scan --classify --fail-on-stale --report=json > tsdoc-topology.json
```

> The gates belong to `scan`, not `check`. `check` already exits `3` on
> undocumented exports, so a `--fail-on-missing` there would be a no-op, while
> `scan` is otherwise read-only and gains its CI role from them.

**Example interactive local flow:**

```bash
npx jsdoc-to-tsdoc convert --interactive --only "src/lib/**"
# → [1/12] src/lib/api.ts
#   <colored unified diff>
#   [a]ccept · [s]kip · [e]dit · [q]uit ?
```

**Example minimal migration:**

```bash
# Only fix @param/@returns hygiene; leave prose untouched
npx jsdoc-to-tsdoc convert --lite --commit-per-file
```

### Handling Non-Standard Documentation

Real projects deviate from the "complete JSDoc" happy path in predictable
ways. The tool must **classify first, then act** — never silently rewrite
comments it does not understand.

**Observed comment topologies:**

1. **Valid JSDoc** — the happy path
2. **Partial JSDoc** — `/** does X */` with no `@param` tags
3. **Line-comment prose** — `// Fetches user by ID` above the export
4. **No docs, rich types** — TS signature is expressive but there is no comment
5. **Stale docs** — `@param name` when the signature actually has `userId`
6. **Bilingual / mixed language** — some Silver Assist projects have Spanish
   prose mixed with English JSDoc tags

**Classification via `scan --classify`** — as shipped:

```text
Documentation analysis — 127 file(s) scanned
┌───────────────┬───────┐
│ Valid TSDoc   │    84 │
│ Partial docs  │    12 │
│ Line comments │     8 │
│ No docs       │    19 │
│ Stale docs    │     4 │
│ No exports    │     0 │
└───────────────┴───────┘
  Valid TSDoc       84 file(s) → ready for `convert`
  Partial docs      12 file(s) → `convert`, then fill the gaps
  Line comments      8 file(s) → prose to promote into `/** */`
  No docs           19 file(s) → run `scaffold`
  Stale docs         4 file(s) → manual review required
Confidence: HIGH 84 · MEDIUM 12 · LOW 27 · STALE 4

Stale documentation — review these by hand:
  src/utils.ts:12 greet
    @param 'name' is not a parameter of greet (found: userId)
```

A file lands in exactly one bucket, and it is the **most severe** topology
among its exports — the one that names the next action. Severity is ordered by
how much human input the fix needs: `stale` has to be read and corrected by
someone who knows the intent, `no-docs` needs prose invented and then reviewed,
`line-comments` already has prose to reuse, `partial` needs a few tags.

Files that export nothing are counted apart rather than folded into `valid`,
which would overstate how much of the project is ready to convert. Test paths
are excluded by default (`--include-tests` opts in), because the ESLint config
`init` writes turns both TSDoc rules off for them.

The human report shows the summary plus the stale findings, which are the only
category a person must act on directly; `--report=json` carries the full
per-declaration detail, gaps included, for tooling.

**Inference rules per topology:**

**Line-comment prose** → promote to `/** */`, then use TS types to add
skeleton `@param` / `@returns`:

```ts
// Before
// Fetches user by ID and returns null if not found
export async function getUser(id: string): Promise<User | null> { ... }

// After (with --promote-line-comments)
/**
 * Fetches user by ID and returns null if not found.
 *
 * @param id - TODO(tsdoc): describe id
 * @returns The user or null when not found
 */
export async function getUser(id: string): Promise<User | null> { ... }
```

**No docs, rich types** → template-driven scaffold with **verb + noun**
inference from the function name:

```ts
// Before (no comment)
export function submitContactForm(
  prevState: CF7ActionState,
  formData: FormData
): Promise<CF7ActionState> { ... }

// After (via `scaffold`)
/**
 * Submits the contact form. // ← inferred from "submit" + "ContactForm"
 *
 * @param prevState - Previous action state.
 * @param formData - Submitted form data.
 * @returns Updated action state.
 * @remarks TODO(tsdoc): verify auto-generated summary
 */
```

Every inferred summary carries a `TODO(tsdoc)` marker so devs can
`grep 'TODO(tsdoc)'` to find everything that needs human review.

**Stale docs** → never auto-rewrite. Report in `scan`:

```text
🔴 src/utils.ts:12  greet()
   @param 'name' not in signature (found: 'userId')
   Suggestion: manual review — likely stale documentation
```

### Confidence Levels

Every file in the classification report carries a confidence label that
drives the recommended action:

| Level | Signal | Default action |
| ------- | -------- | ---------------- |
| **HIGH** | Complete JSDoc consistent with signature | Auto-convert |
| **MEDIUM** | Partial JSDoc, clear TS types | Convert + gap warnings |
| **LOW** | No docs, only types | Scaffold + `TODO(tsdoc)` markers |
| **STALE** | JSDoc contradicts signature | Skip + manual-review report |

The `--fail-on-missing` and `--fail-on-stale` flags let CI enforce a minimum
confidence bar without blocking the entire pipeline on cosmetic issues.

### Future: Optional LLM Enrichment

For LOW / STALE cases the tool can offer opt-in enrichment through:

- **GitHub Copilot CLI** (if available in the shell)
- **Ollama** (local models, no API key required)
- **Anthropic / OpenAI** (via env-provided API key)

This is **always opt-in** (`--enrich=copilot|ollama|anthropic`), never
default-on, and is deferred to **post v0.1.0** (a v0.2+ roadmap item added
after the deterministic pipeline ships). The deterministic pipeline must be
fully usable without any LLM.

---

## Code Architecture & Standards

The CLI itself must be exemplary. Since its whole purpose is to enforce
documentation quality, its own codebase follows strict, boring, predictable
conventions. These standards are lifted from the Next.js projects that
consume this tool (`family-nextjs`, `aa-nextjs`, `homecare-nextjs`, and
friends) and adapted for a pure Node CLI.

### Guiding Principles

| Principle | Rule |
| ----------- | ------ |
| **SRP** | One module = one responsibility. Rules, templates, and reporters are independent files. A file that exceeds ~150 lines is a smell. |
| **DDD-lite** | Folder = domain (`scanner/`, `parser/`, `transformer/`, `scaffolder/`, `escalator/`, `reporter/`), never tech layer (❌ `utils/`, `helpers/`, `services/`). |
| **Barrel exports** | Every domain folder ships an `index.ts` that re-exports its public API. Consumers import from the folder, never from internal files. |
| **Colocation** | Tests live next to code in `__tests__/`. Fixtures live in the domain that owns them. |
| **Dogfooding** | The CLI is documented with TSDoc, linted with `eslint-plugin-tsdoc` + `eslint-plugin-tsdoc-require-2`, and gated by its own `check` command in CI. |
| **Determinism** | Same input → same output. No time, randomness, or network reads in the transformer pipeline. |

### File & Identifier Naming

- **Files & folders**: `kebab-case` (`project-scanner.ts`, `tag-registry.ts`, `remove-type-braces.ts`).
- **Exports**: `PascalCase` for classes/types/interfaces, `camelCase` for functions and constants.
- **Interfaces**: no `I` prefix. `TransformerContext`, not `ITransformerContext`.
- **Boolean names**: prefix with `is`, `has`, `should` (`isDryRun`, `hasCustomTags`, `shouldEscalate`).
- **Constants**: `UPPER_SNAKE_CASE` only for module-level frozen config (`DEFAULT_IGNORE_GLOBS`); scoped constants stay `camelCase`.
- **File ↔ export**: filename mirrors its default/primary export in kebab-case form (`remove-type-braces.ts` exports `removeTypeBraces`).

### Module Structure (barrel pattern)

Every domain folder follows the same shape:

```text
src/transformer/
├── index.ts                    # Public API: `export { runPipeline, type Rule }`
├── pipeline.ts                 # Composition (private module)
├── rules/
│   ├── index.ts                # Barrel: re-exports every rule
│   ├── remove-type-braces.ts
│   ├── add-hyphen-separator.ts
│   └── ...
└── __tests__/
    ├── pipeline.test.ts
    └── rules/
        └── remove-type-braces.test.ts
```

Consumers import cleanly through the barrel:

```ts
// ✅ Correct — from the barrel
import { runPipeline, type Rule } from "@/transformer";

// ❌ Wrong — reaching into internals
import { runPipeline } from "@/transformer/pipeline";
import { removeTypeBraces } from "@/transformer/rules/remove-type-braces";
```

The barrel is the contract; internal files can be renamed or split without
breaking consumers.

### Definition of Done

A change is not finished when its tests pass. Every item below was omitted at
least once and caught in review rather than by a gate, so each one names the
concrete failure that put it here.

**Adding a domain**

- [ ] Barrel `index.ts` with a `@packageDocumentation` header stating what the
      domain answers.
- [ ] **Re-exported from `src/index.ts`**, or deliberately absent with the
      reason written in that file's header. `classifier` shipped with a barrel,
      tests, docs and a command consuming it, but no path from the package root
      — invisible to every library consumer while the entry point claimed to
      re-export each domain. `src/__tests__/public-surface.test.ts` pins the
      exported names, so this now fails a test instead of waiting for a
      reviewer.
- [ ] Tests in `__tests__/`, asserting at the layer that owns the behaviour. A
      test that still passes when the fix is reverted is proving nothing.

**Changing what a module does**

- [ ] Its file header describes the module as it is now, not as it was. Three
      headers had quietly narrowed: `scan.ts` still called itself an inventory
      after gaining a second mode and two CI gates, `insertion-location.ts`
      still promised a boolean after it began labelling four kinds of comment,
      and `export-inventory.ts` was framed around `scaffold` alone after the
      classifier became a second consumer.
- [ ] Any docstring that a reader could act on still matches the design. A
      summary that contradicts the code invites the next reader to "fix" the
      code to match the summary.

**Changing the CLI surface**

- [ ] `README.md` usage and options table, including how a new flag interacts
      with existing ones. `--lite` was accepted and silently ignored alongside
      `--classify`, so a CI job could read the output as the narrower set it
      asked for.
- [ ] `PLAN.md` — the *In Scope (v0.1.0)* checkbox, and any example output in
      this file that the change makes stale.
- [ ] `CHANGELOG.md` under *Unreleased*.
- [ ] `AGENTS.md` §11 (handoff and what is next) and §12 (the decisions and
      traps this iteration produced).

**Automating a manual step**

- [ ] Delete the instruction that told people to do it by hand. An interim
      workaround is written as an instruction and outlives the problem silently,
      because nothing fails when it goes stale. `AGENTS.md` §9 said to request
      the Copilot review manually "until the workflow lands on the default
      branch"; the workflow landed, the sentence stayed, and it was followed
      months later — three no-op comments on PR #19.
- [ ] Say where the automation runs and what it looks like when it works, so
      "it did not happen" is distinguishable from "it has not happened yet".
      Without that, the natural response to a slow run is to redo it by hand.

**Before asking for review**

- [ ] `npm run check` from the repo root — typecheck, lint, tests, and the
      `check` dogfood over the CLI's own source.
- [ ] **Fix the class, not the instance.** Every defect above recurred at least
      once because it was fixed where it was reported. When a review finds one,
      sweep every place the same shape could exist — and match the *semantic*
      class: sweeping Markdown fences for "unlabelled" left the ones mislabelled
      `bash` untouched, and they came back the next round.

### TSDoc-First (dogfooding)

Every exported symbol in the CLI **must** have valid TSDoc. This is enforced
by the CLI's own `check` command running in CI — the same command it exposes
to users. Rules that apply to consumer projects apply here first, and
**stricter**:

```ts
/**
 * Removes `{Type}` braces from `@param` and `@returns` tags.
 *
 * TSDoc encodes parameter types via the surrounding TypeScript signature,
 * so brace annotations are redundant and rejected by the official parser.
 *
 * @param comment - Raw JSDoc comment text, including leading `/**` and trailing `*\/`.
 * @returns The rewritten comment with type braces stripped.
 *
 * @example
 * ```ts
 * removeTypeBraces("@param {string} name - The user name.");
 * // → "@param name - The user name."
 * ```
 *
 * @public
 */
export function removeTypeBraces(comment: string): string {
  // ...
}
```

Rules enforced on the CLI's own codebase (stricter than the defaults shipped
to consumers):

| Rule | Setting on the CLI | Default for consumers |
| ------ | ------------------- | ----------------------- |
| `tsdoc/syntax` | `error` | `error` |
| `tsdoc-require-2/require` | `error` | `warn` (progressive) |
| `tsdoc-require-2/require-param` | `error` | `off` (opt-in) |
| `tsdoc-require-2/require-returns` | `error` | `off` (opt-in) |

### TypeScript Discipline

- **`strict: true`**, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **No `any`.** Ever. Use `unknown` and narrow, or define a proper type.
- **No non-null assertions (`!`).** Prove the value exists or handle the `undefined` branch explicitly.
- **Discriminated unions** for command result types: `{ ok: true; data } | { ok: false; error }`.
- **Named exports only** from library modules. Default export is reserved for `citty` command definitions.
- **`readonly`** on all shared data structures (rules, template registries, config objects).

### Imports

- **Absolute paths** via `@/` (mapped in `tsconfig.json`) — never `../../`.
- **Order** (blank line between groups):
  1. Node built-ins (`node:fs`, `node:path`).
  2. External deps (`citty`, `typescript`, `@microsoft/tsdoc`).
  3. Internal absolute (`@/scanner`, `@/transformer`).
  4. Type-only imports (`import type { … } from …`).
- Within each group, alphabetize.
- Type-only imports **must** use `import type` so the bundler drops them cleanly.

### Error Handling

- **Never `throw` for expected conditions.** Return a discriminated result union.
- **`throw` is reserved for programmer errors** — invariants that should never fire at runtime.
- **Every CLI command wraps its main flow in `try/catch`** and maps failures to the exit codes defined in [CLI UX & Distribution](#cli-ux--distribution) (0 / 1 / 2 / 3).
- **All I/O is async.** No `readFileSync` in hot paths; parallelize with `Promise.all` for independent file reads.
- **Errors carry context** — wrap with `{ cause }` so stack traces point to the real origin.

### Testing

- **Framework**: Vitest.
- **Location**: `__tests__/` colocated with the module under test (never a global top-level `tests/`).
- **Naming**: `<module-name>.test.ts` mirrors the source filename.
- **Coverage targets**: 100% for pure transformer rules and the tag registry; ≥ 80% overall.
- **Fixtures**: Real code snippets from the three completed migrations (see [Fixture Strategy](#fixture-strategy)); no synthetic-only tests for the transformer pipeline.
- **Snapshot tests** for full pipeline outputs; **unit tests** for individual rules.
- **Mocks defined before imports** (Vitest hoists `vi.mock` — same rule as Jest).
- **No shared mutable state** between tests. Each test builds its own fixture in a temp dir when I/O is required.

### Commits & Branches

Same conventions as the Next.js consumer projects, adapted for public OSS
(no Jira ticket prefix):

- **Branches**: `feature/<short-description>` or `fix/<short-description>`.
- **Commits**: Conventional Commits — `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `style`, `build`.
- **One reviewable unit per commit.** Formatting-only changes go in their own commit, separate from logic.
- **`CHANGELOG.md`**: Keep a Changelog format, updated for every user-visible change.
- **No AI-attribution trailers** in commit messages.

### Pre-commit Quality Gates

Every push/PR to `main` must pass locally **and** in CI:

| Check | Command |
| ------- | --------- |
| Type check | `tsc --noEmit` |
| Lint | `eslint .` |
| TSDoc lint (dogfood) | `jsdoc-to-tsdoc check` (once bootstrapped) |
| Unit tests | `vitest run --coverage` |
| Build | `unbuild` produces the `dist/` bundle |
| Bundle size | Post-build assertion: gzipped `dist/cli.mjs` ≤ 500 KB |

The CI matrix runs on **Node 20.19, 22, and 24 LTS**, across **Ubuntu, macOS,
and Windows**. Windows is included because the CLI manipulates file paths and
line endings — path-separator normalization and CRLF handling are exercised on
a real Windows runner. Architecture (x64 vs ARM) is not fanned out separately:
the tool and all its dependencies are pure JavaScript with no native addons, so
behavior is identical across architectures (and `ubuntu-latest` / `macos-latest`
already cover Linux x64 and macOS ARM64 respectively). All `run` steps use bash
on every OS so the shell-based bundle-size gate is portable.

---

## Scope Boundaries

### In Scope (v0.1.0)

Everything in this section is in scope for v0.1.0. The marks track delivery, not
scope: `[x]` is implemented and tested on `main`, `[ ]` is still outstanding and
mirrors the [Deferred](#deferred-next-increments) list above. Keeping the two in
step matters — an advertised-but-missing flag is a documented past mistake (see
`AGENTS.md` -> Lessons learned).

Bootstrapping & config:

- [x] Detect project layout (tsconfig, eslint flat config, package manager)
- [x] **Auto-install `eslint-plugin-tsdoc` + `eslint-plugin-tsdoc-require-2`** *(promoted from Out of Scope)*
- [x] **Auto-patch `eslint.config.mjs`** with correct rules and known-safe defaults *(promoted)*
- [x] Detect custom tags → generate `tsdoc.json`

Conversion (existing JSDoc → TSDoc):

- [x] Remove `{type}` braces from `@param` and `@returns`
- [x] Add hyphen separator to `@param` descriptions
- [x] Remove redundant JSDoc tags (`@function`, `@async`, `@class`, `@enum`)
- [x] Remove JSDoc-only tags (`@typedef`, `@callback`, `@type`)
- [x] Convert `@fileoverview`/`@module` → `@packageDocumentation`
- [x] Convert `@access private` → `@internal`
- [x] **Restructure `@property` → inline interface field docs** — the
      description moves onto the member when the member has none, the tag is
      deleted when the member already documents itself, and the prose becomes a
      Markdown list item when the declaration has no such member. Measured on
      the three real repos before migration: of 25 tags, 10 were being destroyed
      and now none are

Scaffolding (new TSDoc for undocumented exports):

- [x] Enumerate exports lacking TSDoc via TS Compiler API
- [x] Template-based stubs for React components, Server Actions, hooks,
      interfaces, type aliases, generic exports *(promoted from Out of Scope)*
- [x] Name-based summary inference (kebab-case → prose)
- [x] Interactive mode to confirm/edit generated summaries *(`scaffold --interactive`)*

Enforcement progression:

- [x] `init --progressive` (default) → starts at `warn`
- [x] `init --strict` → starts at `error`
- [x] `escalate` command → warn → error with preflight check

Reporting & CI:

- [x] Dry-run mode with unified diff for every command
- [x] `--report=<fmt>` (`json` / `md` / `table`) written to stdout for every command
- [x] `check` command → exit `3` on rule violations (per exit-code contract),
      `2` when `tsdoc.json` cannot be read
- [x] **`--preview` per-file diff mode** *(see [CLI UX](#cli-ux--distribution))*
- [x] **`--interactive` per-file review mode** — `convert` / `scaffold`, accept/skip/edit/quit
- [x] **`--only` / `--exclude` glob filters** for targeted runs
- [x] **`--lite` mode** — only `@param` / `@returns` hygiene, leave prose untouched
- [ ] **`--commit-per-file`** for reviewable PRs
- [x] **`--fail-on-missing` / `--fail-on-stale`** confidence gates *(on `scan`)*
- [x] **`scan --classify`** — topology report (VALID / PARTIAL / LINE_COMMENTS / NO_DOCS / STALE)
- [x] **`convert --promote-line-comments`** — wrap `//` prose into `/** */`

Found by comparing the CLI against the hand migration on `osa-nextjs`
(`feature/tsdoc-implementation`), which takes that repo from 143 remaining
`check` errors to roughly 9. The hand migration shows the intended output for
each, so none of them is a guess. **4 remain**, all `@param` with no description
that a comment-only tool could recover:

- [x] **Fence unfenced `@example` bodies** — shipped. Removed **95** of the 143
  (the 36 `tsdoc-malformed-inline-tag`, the 36 `tsdoc-escape-right-brace`, the 6
  `tsdoc-escape-greater-than`, the `tsdoc-malformed-html-name`, and 16 of the 24
  `tsdoc-at-sign-in-word` that sat inside examples), taking `osa` from 143
  errors over 40 files to **48 over 18**. Fences only bodies TSDoc would
  misparse, matching the human's decision on 101 of 102 examples.
- [x] **Backtick a bare `@` in prose** — shipped (#28). `@/lib/seo` path
  aliases, `@scope/pkg` scopes, and decorators named in prose all read as tags
  to TSDoc (`tsdoc-at-sign-without-tag-name`, `tsdoc-at-sign-in-word`); wrapping
  just the token clears the class in full, taking `osa` from 48 to **30**.
- [x] **Fold dotted `@param params.foo`** — shipped (#29). TSDoc has no notion
  of a dotted parameter path (`tsdoc-param-tag-with-invalid-name`); each child is
  folded into the parent's description as a lossless `(child: description, …)`
  list, matching the hand migration and clearing the class in full — `osa` from
  30 to **4**. The 4 left are bare `@param value` with no description, which the
  human wrote from the code and a comment-only tool cannot invent.

Distribution:

- [x] **Runnable via `npx jsdoc-to-tsdoc` with zero global install** *(see [Distribution](#distribution-via-npx))*
- [x] **Bundle target < 500 KB gzipped** (unbuild/tsup, ESM only)
- [x] **TypeScript as peer dependency** (never bundle the compiler)
- [x] **Node >= 20.19** (toolchain floor: Vitest needs `util.styleText`, added in
      Node 20.12; ESLint 10 requires `^20.19`), well-defined exit codes (0/1/2/3)

Codebase discipline:

- [x] **CLI is TSDoc-strict from day one** — `tsdoc/syntax` and
      `tsdoc-require-2/require` run at `error` over its own source in CI; once
      `check` ships it dogfoods that too *(see [Code Architecture & Standards](#code-architecture--standards))*
- [x] **Kebab-case files, barrel exports, DDD folder layout, no `any`**
- [x] **Vitest colocated in `__tests__/`, ≥ 80% coverage, 100% on transformer rules**

### Out of Scope (future)

- [ ] VS Code extension wrapper (v0.2+)
- [ ] **LLM-assisted enrichment** (`--enrich=copilot|ollama|anthropic`) — v0.2, opt-in flag only
- [ ] Automatic `@remarks` splitting on prose heuristics (fragile — defer)
- [ ] Monorepo support with multiple `tsdoc.json` files (v0.3)
- [ ] Prebuilt GitHub Action / Bitbucket Pipe wrapper (v0.2)
- [ ] Framework-specific templates beyond React/Next.js (Vue, Svelte)
- [ ] Automatic rebase-conflict resolver for the warn→error escalation line
- [ ] **Automatic stale-doc rewriter** (always requires human review in v0.1)

---

## Fixture Strategy

Snapshot tests are seeded from the three real migrations already completed.
Fixtures are stored in `tests/fixtures/<repo>/<before|after>/` and cover the
end-to-end pipeline (init + convert + scaffold + escalate).

| Fixture set | Source | Pre-migration commit | Files | Notable patterns |
| ------------- | -------- | ---------------------- | ------- | ------------------ |
| `nextjs-boilerplate` | rebased `feature/tsdoc-migration` | `b803d9c` | 14 | React components, hooks, CCDS lib |
| `homecare-nextjs` | merged squash on `dev` | `9d155e7` | 26 | Same + WP GraphQL types |
| `assistedliving-nextjs` | merged squash on `stg` | `f1f10ba` | 47 | Same + Server Actions, extensive interfaces |

The repo owner has these commits locally and can extract before/after pairs
without contacting the source projects.

**Always extract the "before" side fresh from the pinned commit** —
`git -C <repo> show <commit>:<path>` — rather than reusing a working copy. A
copy the CLI has already converted still passes `convert` and `check`; it
reports "nothing to convert" and reads exactly like a successful run. Until
these fixtures land in `tests/fixtures/`, every manual validation run has to
re-extract its own inputs.

---

## Development Roadmap

| Phase | Description | Status |
| ------- | ------------- | -------- |
| 0 | Project plan and gap analysis | **Done** |
| 0.5 | **Plan revision from real-world learnings** | **Done (this doc)** |
| 1 | Core scanner + comment extractor + export inventory | **Done** — `export-inventory.ts` classifies exports and locates insertion points |
| 2 | Parser + tag registry | **Done** |
| 3 | Transformation rules (existing JSDoc → TSDoc) | **Done** |
| 4 | `tsdoc.json` + ESLint config generator/patcher | **Done** — `generator` domain + `init` command |
| 5 | **Scaffolder templates** (components, actions, hooks, interfaces) | **Done** — `scaffolder` domain + `scaffold` command |
| 6 | CLI subcommand shell (`init`, `scan`, `convert`, `scaffold`, `escalate`, `check`) | **Done** — all six subcommands ship |
| 6.5 | **Classifier domain + `scan --classify`** and the confidence gates | **Done** — `classifier` domain, `--fail-on-missing` / `--fail-on-stale` |
| 7 | Interactive review (`@clack/prompts`) | **Done** — `prompter` domain + `convert`/`scaffold` `--interactive` |
| 8 | **Escalator + preflight ESLint check** | **Done** — `escalator` domain + `escalate` command |
| 9 | Fixture-based snapshot tests (3 real repos) | **Partial** — unit + integration tests done (567 tests, ~95 %); repo fixtures pending |
| 10 | Dogfood on a 4th real repo end-to-end | Not started |
| 11 | npm publish as `jsdoc-to-tsdoc` v0.1.0 | Not started |

---

## References

- [TSDoc specification](https://tsdoc.org/)
- [TSDoc Playground](https://tsdoc.org/play/) — test comments interactively
- [`@microsoft/tsdoc` parser](https://www.npmjs.com/package/@microsoft/tsdoc) — 49M weekly downloads
- [`@microsoft/tsdoc-config`](https://www.npmjs.com/package/@microsoft/tsdoc-config) — `tsdoc.json` loader
- [`eslint-plugin-tsdoc`](https://www.npmjs.com/package/eslint-plugin-tsdoc) — 4.3M weekly downloads
- [`eslint-plugin-tsdoc-require-2`](https://www.npmjs.com/package/eslint-plugin-tsdoc-require-2) — enforces comment presence
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) — for AST traversal
- [TSDoc approach document](https://tsdoc.org/pages/intro/approach/) — design goals and lax/strict modes
- [citty](https://github.com/unjs/citty) — subcommand-friendly CLI framework
- [@clack/prompts](https://github.com/natemoo-re/clack) — interactive prompts
