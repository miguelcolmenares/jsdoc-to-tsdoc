# jsdoc-to-tsdoc

CLI tool to migrate JSDoc comments to the [TSDoc](https://tsdoc.org/) standard in TypeScript projects.

> **Status: Alpha (v0.1.0, in development).** Every command in the CLI contract ships: the full `init → convert → scaffold → escalate` workflow plus the `check` CI gate. See [PLAN.md](./PLAN.md) for what is still deferred.

## The Problem

TypeScript projects commonly use JSDoc-style documentation comments that include type annotations (`{string}`, `{boolean}`), redundant tags (`@function`, `@typedef`, `@callback`), and non-standard tags. These are incompatible with the [TSDoc specification](https://tsdoc.org/) and cause lint errors when `eslint-plugin-tsdoc` is enabled.

There is **no existing tool** to automate this migration end to end. See [PLAN.md](./PLAN.md) for the full gap analysis.

## Usage

```bash
# Bootstrap: generate tsdoc.json, patch the ESLint flat config, list deps to install
npx jsdoc-to-tsdoc init

# Inventory what would change (read-only)
npx jsdoc-to-tsdoc scan

# Preview a colored unified diff without writing
npx jsdoc-to-tsdoc convert --dry-run

# Apply the conversion
npx jsdoc-to-tsdoc convert

# Generate TSDoc stubs for exports that have no documentation
npx jsdoc-to-tsdoc scaffold --dry-run
npx jsdoc-to-tsdoc scaffold

# Lock the codebase in: bump tsdoc-require-2/require from "warn" to "error"
npx jsdoc-to-tsdoc escalate --dry-run
npx jsdoc-to-tsdoc escalate

# CI gate — validate TSDoc, report undocumented exports, exit 3 on problems
npx jsdoc-to-tsdoc check

# Narrower gates — exit code 3 if a given command would change anything
npx jsdoc-to-tsdoc convert --check
npx jsdoc-to-tsdoc scaffold --check
npx jsdoc-to-tsdoc escalate --check
```

### Options

| Flag | Commands | Purpose |
|------|----------|---------|
| `--cwd <dir>` | all | Project directory to scan (default `.`). |
| `--dry-run` / `--preview` | `init`, `convert`, `scaffold`, `escalate` | Show a diff without writing. |
| `--strict` | `init` | Start `tsdoc-require-2/require` at `error` instead of `warn`. |
| `--install` | `init` | Run the detected package manager to install missing dev dependencies. |
| `--check` | `convert`, `scaffold`, `escalate` | CI mode — exit `3` if anything would change; never writes. |
| `--lite` | `scan`, `convert` | Only `@param` / `@returns` hygiene; leave prose and structural tags. |
| `--severity <level>` | `escalate` | Target severity: `error` (default) or `warn` to walk it back. |
| `--skip-preflight` | `escalate` | Patch the config without running ESLint first. |
| `--syntax-only` | `check` | Only validate comment syntax; ignore undocumented exports and legacy JSDoc. |
| `--include-tests` | `check` | Also check the test paths `init` exempts from the TSDoc rules. |
| `--only <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to include (e.g. `"src/lib/**"`). |
| `--exclude <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to exclude (e.g. `"**/*.test.ts"`). |
| `--report <fmt>` | all | Machine-readable output: `json` or `md` (written to stdout). |

## What `init` does

Bootstraps a project for TSDoc without touching source comments:

- Scans the codebase for custom block tags and registers the recognized ones (`@since`, `@author`, `@version`) in a generated or merged `tsdoc.json`; unknown tags are reported for a manual decision.
- Patches the ESLint flat config (`defineConfig([…])`, `tseslint.config(…)`, or a bare array) with the TSDoc plugins and rules — `tsdoc/syntax` at `error`, `tsdoc-require-2/require` at `warn` (progressive), and `require-param` / `require-returns` at `off` to avoid known false positives on interfaces, types, and constants. The patch is idempotent and non-destructive; when the config shape is unrecognized it prints a copy-pasteable snippet.
- Detects the package manager and prints the exact dev-dependency install command (or runs it with `--install`).

Use `--strict` to lock the presence rule in at `error` from day one instead of the progressive `warn`.

## What `convert` does

Deterministic, formatting-preserving transformations derived from real-world migrations:

- Strips `{Type}` braces from `@param` / `@returns` / `@property`.
- Renames `@return` → `@returns`, `@template` → `@typeParam`, `@default` → `@defaultValue`.
- Removes `Promise<T>` wrappers from `@returns` descriptions.
- Removes JSDoc optional-parameter brackets: `@param [id=1]` → `@param id`.
- Inserts the mandatory `name - description` hyphen in `@param` / `@typeParam`.
- Converts `@access private` / `@private` → `@internal` (and `@protected` / `@public`).
- Converts `@module` / `@fileoverview` → `@packageDocumentation`.
- Deletes TypeScript-redundant tags (`@function`, `@async`, `@class`, `@enum`, …) and JSDoc-only tags (`@typedef`, `@callback`, `@type`, `@property`).

Content inside fenced code blocks (```` ```…``` ````) is never modified, so `@example` code is preserved verbatim.

## What `scaffold` does

Generates a TSDoc stub for every exported declaration that has **no** documentation — in the real migrations this was ~80% of the work. Exports that already have a doc comment are never touched, and re-export statements (`export { x } from "./x"`) are skipped because the symbol is documented at its definition site.

Exports are found and classified through the TypeScript compiler API, so an `export` keyword inside a string or a nested scope is never mistaken for a declaration:

| Export shape | Generated stub |
|------|------|
| `export default function HeroSection({…}: HeroSectionProps)` | "Renders the hero section." + `@param props` + `@returns` |
| `export async function submitContactForm(prevState, formData)` | "Server Action. Submits the contact form." + one `@param` each + `@returns` |
| `export const useHash = () => …` | "React hook for the hash." + `@returns` |
| `export interface HeroSectionProps` | "Hero section props." |
| `export type LeadStatus = …` | "Lead status." |
| `export function identity<T>(value: T): T` | `@typeParam T` + `@param value` + `@returns` |
| `export function logOnly(msg: string): void` | `@param msg`, and **no** `@returns` |

Summaries are inferred deterministically from the identifier (no LLM): the leading verb is conjugated (`submit` → "Submits"), predicates read as "Reports whether …", and acronym/kebab/snake names are split correctly. Because inference is a guess, **every stub carries a `TODO(tsdoc)` marker**:

```bash
grep -rn "TODO(tsdoc)" src
```

Stub tag order follows the TSDoc convention — summary, `@remarks`, `@typeParam`/`@param`, `@returns` — and the generated output is valid under `tsdoc/syntax` and satisfies `tsdoc-require-2/require`. Running `scaffold` twice is a no-op.

## What `escalate` does

Closes the migration by flipping `tsdoc-require-2/require` from the progressive `warn` to `error`, so missing documentation fails CI from that commit on.

Because every message the rule emits at `warn` becomes a build failure at `error`, the patch is gated on a **preflight**: the project's own ESLint is resolved and run with the project's own config, and the escalation is refused (exit `3`) while the rule still reports anything.

```bash
$ npx jsdoc-to-tsdoc escalate
✗ 3 export(s) still reported by tsdoc-require-2/require:
  src/lib/api.ts:12:8  Missing TSDoc for function fetchLead.
  …
Run `jsdoc-to-tsdoc scaffold` to document them, or --skip-preflight to escalate anyway.
```

Reading the real config — instead of forcing the rule on through an override — is what makes that verdict trustworthy: every `off` the project configured (the `__tests__/` exemption `init` writes, most commonly) is honoured exactly as CI honours it, so the check cannot invent violations the pipeline would never report. For the same reason the patch itself only rewrites **enabled** assignments: an explicit `off` is a deliberate opt-out and is never switched on, and the sibling rules `require-param` / `require-returns` are never touched.

The result is a one-line diff — the only line that ever conflicts when a long-lived migration branch is rebased:

```diff
-      "tsdoc-require-2/require": "warn",
+      "tsdoc-require-2/require": "error",
```

Use `--check` as a cheap CI gate that asks "is this repo locked in yet?" (exit `3` if not, no lint run), `--dry-run` to preview the diff, and `--severity warn` to walk an escalation back.

## What `check` does

The CI gate, and the only command that validates rather than transforms. It never writes.

Comments are parsed with **`@microsoft/tsdoc` itself** — the same parser `eslint-plugin-tsdoc` runs — so a clean `check` predicts a clean lint. Three categories are reported:

| Category | Meaning |
|------|------|
| `syntax` | The official parser rejected the comment. |
| `missing` | An export carries no doc comment. |
| `legacy` | The comment still holds JSDoc that `convert` would rewrite. |

```bash
$ npx jsdoc-to-tsdoc check
src/lib/api.ts
  12:11   syntax  The @param block should not include a JSDoc-style '{type}' (tsdoc-param-tag-with-invalid-type)
  40:1    missing Missing TSDoc for fetchLead.
┌─────────────────────────┬───────┐
│ Files scanned           │    87 │
│ Files with problems     │     1 │
│ TSDoc syntax errors     │     1 │
│ Exports without TSDoc   │     1 │
│ Files with legacy JSDoc │     0 │
└─────────────────────────┴───────┘
✗ 2 problem(s) across 1 file(s).
```

Two behaviours keep the gate honest rather than merely strict:

- **The project's `tsdoc.json` is loaded first.** Without it every `@since` in a real codebase is reported as an undefined tag — violations the project's own lint accepts. If that file exists but cannot be read, `check` exits `2` and inspects nothing, because reporting thousands of bogus problems is worse than stopping. A project that simply has no `tsdoc.json` yet is not an error.
- **Test paths are skipped by default**, because the ESLint config `init` generates turns both TSDoc rules off for them. A gate that reported what the tool's own scaffolding excuses would be reporting phantom work. `--include-tests` opts back in.

Exit codes: `0` clean · `2` unreadable `tsdoc.json` · `3` problems found.

## Development

```bash
npm install
npm run check   # typecheck + lint + test + the CLI's own `check` over this repo
npm run build   # bundle to dist/ via unbuild
```

The CLI dogfoods the tooling it ships: it is documented with TSDoc, linted with `eslint-plugin-tsdoc` + `eslint-plugin-tsdoc-require-2` at `error`, and gated by its own `check` command (`npm run check:tsdoc`).

## License

MIT
