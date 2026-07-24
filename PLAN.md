# jsdoc-to-tsdoc — Project Plan

> **Revision:** v2 — Updated with learnings from three real-world migrations
> (`nextjs-boilerplate`, `homecare-nextjs`, `assistedliving-nextjs`; ~87 files
> across 3 repos, July 2026).

## Gap Analysis

### What Exists Today (July 2026)

#### Microsoft Official Ecosystem (strong)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| `@microsoft/tsdoc` | 49M | Core parser — reads and validates TSDoc comments |
| `@microsoft/tsdoc-config` | 23.8M | Loads `tsdoc.json` (custom tags like `@since`) |
| `eslint-plugin-tsdoc` | 4.3M | ESLint rule that validates syntax (`tsdoc/syntax`) |
| `@microsoft/api-extractor` | 19.5M | Full API surface review, `.d.ts` rollups, doc output |

#### Enforcement / Linting (good, growing)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| `eslint-plugin-tsdoc-require-2` | 1.3K | Enforces that exports have TSDoc + specific tags |
| `@guardian/eslint-plugin-tsdoc-required` | 1.2K | Basic export comment enforcement |

#### Documentation Generation (good)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| TypeDoc | Standard | HTML/JSON API docs from TSDoc |
| `tsdoc-markdown` | 8.8K | Markdown generation from TSDoc |

#### VS Code Extensions (weak / dead)

| Extension | Installs | Status |
|-----------|----------|--------|
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
|---------------|-----------------|----------------------|
| `@param {string} name Description` | `@param name - Description` | Simple — regex/AST strip |
| `@returns {boolean} Description` | `@returns Description` | Simple — regex/AST strip |
| `@fileoverview Description` | `@packageDocumentation` + summary paragraph | Medium — restructure |
| `@module ModuleName` | `@packageDocumentation` | Simple — tag swap |
| `@typedef {Object} MyType` | Remove entirely | Simple — delete |
| `@callback MyCallback` | Remove entirely | Simple — delete |
| `@type {Type}` | Remove entirely | Simple — delete |
| `@property {string} name` | Inline `/** comment */` on interface member | Medium — structural (**now in scope**) |
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
|------|-------------------|---------------------------|---------------------|----------------------|
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
|-------|---------------|-------------|
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
|--------------|--------------|
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

```
$ npx jsdoc-to-tsdoc <command> [options]

Commands:
  init         Bootstrap ESLint plugins + tsdoc.json (rule=warn by default)
  scan         Inventory report: what convert/scaffold will touch (no writes)
  convert      Transform existing JSDoc → TSDoc syntax
  scaffold     Generate TSDoc stubs for exports without documentation
  escalate     Bump tsdoc-require-2/require from "warn" to "error"
  check        CI-friendly: exit 1 if any warnings/errors remain

Global options:
  --dry-run          Show diff, do not write
  --interactive      Prompt for ambiguous decisions (default: on for scaffold)
  --config <path>    Path to eslint.config (auto-detected by default)
  --report <path>    Write JSON report to path
```

### Example: `init`

```
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

```
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

```
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

```
src/
├── cli.ts                    # citty entry point + subcommand dispatch
├── commands/
│   ├── init.ts
│   ├── scan.ts
│   ├── convert.ts
│   ├── scaffold.ts
│   ├── escalate.ts
│   └── check.ts
├── scanner/
│   ├── projectScanner.ts     # Find TS files, detect config
│   ├── commentExtractor.ts   # ts.getLeadingCommentRanges() based extraction
│   └── exportInventory.ts    # Enumerate exported declarations lacking TSDoc
├── parser/
│   ├── jsdocParser.ts        # Parse JSDoc tags from comment text
│   └── tagRegistry.ts        # JSDoc → TSDoc tag mapping
├── transformer/
│   ├── pipeline.ts
│   ├── rules/
│   │   ├── removeTypeBraces.ts
│   │   ├── addHyphenSeparator.ts
│   │   ├── convertFileOverview.ts
│   │   ├── convertProperty.ts       # @property → inline interface docs (NEW)
│   │   ├── removeRedundantTags.ts
│   │   ├── removeJsDocOnlyTags.ts
│   │   ├── convertAccessTags.ts
│   │   └── splitRemarks.ts
│   └── index.ts
├── scaffolder/                       # NEW
│   ├── templates/
│   │   ├── reactComponent.ts         # export default function → props docs
│   │   ├── serverAction.ts           # (prevState, formData) → param docs
│   │   ├── hook.ts                   # useX → return docs
│   │   ├── interface.ts              # per-field inline docs
│   │   ├── typeAlias.ts
│   │   └── generic.ts                # fallback for arbitrary exports
│   ├── nameInference.ts              # kebab/camelCase → prose summary
│   └── index.ts
├── generator/
│   ├── tsdocJsonGenerator.ts         # from detected custom tags
│   └── eslintConfigPatcher.ts        # patches flat config (in scope now)
├── escalator/                        # NEW
│   ├── ruleUpdater.ts                # warn → error patch
│   └── preflightCheck.ts             # verify 0 warnings before escalating
├── reporter/
│   ├── dryRunReporter.ts
│   ├── jsonReporter.ts               # machine-readable output for CI
│   └── summaryReporter.ts
└── writer/
    └── fileWriter.ts
```

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
10. **Machine-readable output** — every command supports `--report=<path>` for
    JSON output, enabling GitHub Actions / Bitbucket Pipelines integrations.

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

## Scope Boundaries

### In Scope (v0.1.0)

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
- [x] **Restructure `@property` → inline interface field docs** *(promoted from Out of Scope)*

Scaffolding (new TSDoc for undocumented exports):
- [x] Enumerate exports lacking TSDoc via TS Compiler API
- [x] Template-based stubs for React components, Server Actions, hooks,
      interfaces, type aliases, generic exports *(promoted from Out of Scope)*
- [x] Name-based summary inference (kebab-case → prose)
- [x] Interactive mode to confirm/edit generated summaries

Enforcement progression:
- [x] `init --progressive` (default) → starts at `warn`
- [x] `init --strict` → starts at `error`
- [x] `escalate` command → warn → error with preflight check

Reporting & CI:
- [x] Dry-run mode with unified diff for every command
- [x] `--report=<path>` JSON output for every command
- [x] `check` command → exit 1 if warnings/errors remain

### Out of Scope (future)

- [ ] VS Code extension wrapper (v0.2+)
- [ ] LLM-assisted summary rewriting (v0.2, opt-in flag only)
- [ ] Automatic `@remarks` splitting on prose heuristics (fragile — defer)
- [ ] Monorepo support with multiple `tsdoc.json` files (v0.3)
- [ ] Prebuilt GitHub Action / Bitbucket Pipe wrapper (v0.2)
- [ ] Framework-specific templates beyond React/Next.js (Vue, Svelte)
- [ ] Automatic rebase-conflict resolver for the warn→error escalation line

---

## Fixture Strategy

Snapshot tests are seeded from the three real migrations already completed.
Fixtures are stored in `tests/fixtures/<repo>/<before|after>/` and cover the
end-to-end pipeline (init + convert + scaffold + escalate).

| Fixture set | Source | Files | Notable patterns |
|-------------|--------|-------|------------------|
| `nextjs-boilerplate` | rebased `feature/tsdoc-migration` | 14 | React components, hooks, CCDS lib |
| `homecare-nextjs` | merged squash on `dev` | 26 | Same + WP GraphQL types |
| `assistedliving-nextjs` | merged squash on `stg` | 47 | Same + Server Actions, extensive interfaces |

The repo owner has these commits locally and can extract before/after pairs
without contacting the source projects.

---

## Development Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project plan and gap analysis | **Done** |
| 0.5 | **Plan revision from real-world learnings** | **Done (this doc)** |
| 1 | Core scanner + comment extractor + export inventory | Not started |
| 2 | Parser + tag registry | Not started |
| 3 | Transformation rules (existing JSDoc → TSDoc) | Not started |
| 4 | `tsdoc.json` + ESLint config generator/patcher | Not started |
| 5 | **Scaffolder templates** (components, actions, hooks, interfaces) | Not started |
| 6 | CLI subcommand shell (`init`, `scan`, `convert`, `scaffold`, `escalate`, `check`) | Not started |
| 7 | Interactive wizard (`@clack/prompts`) | Not started |
| 8 | **Escalator + preflight ESLint check** | Not started |
| 9 | Fixture-based snapshot tests (3 real repos) | Not started |
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
