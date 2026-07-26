# jsdoc-to-tsdoc

CLI tool to migrate JSDoc comments to the [TSDoc](https://tsdoc.org/) standard in TypeScript projects.

> **Status: Alpha (v0.1.0, in development).** The `init`, `scan`, `convert`, and `scaffold` commands are implemented and tested. `escalate` and `check` are on the roadmap — see [PLAN.md](./PLAN.md).

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

# CI gate — exit code 3 if any file would change / any export lacks TSDoc
npx jsdoc-to-tsdoc convert --check
npx jsdoc-to-tsdoc scaffold --check
```

### Options

| Flag | Commands | Purpose |
|------|----------|---------|
| `--cwd <dir>` | all | Project directory to scan (default `.`). |
| `--dry-run` / `--preview` | `init`, `convert`, `scaffold` | Show a diff without writing. |
| `--strict` | `init` | Start `tsdoc-require-2/require` at `error` instead of `warn`. |
| `--install` | `init` | Run the detected package manager to install missing dev dependencies. |
| `--check` | `convert`, `scaffold` | CI mode — exit `3` if anything would change; never writes. |
| `--lite` | `scan`, `convert` | Only `@param` / `@returns` hygiene; leave prose and structural tags. |
| `--only <globs>` | all | Comma-separated globs to include (e.g. `"src/lib/**"`). |
| `--exclude <globs>` | all | Comma-separated globs to exclude (e.g. `"**/*.test.ts"`). |
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

## Development

```bash
npm install
npm run check   # typecheck + lint + test
npm run build   # bundle to dist/ via unbuild
```

The CLI dogfoods the tooling it ships: it is documented with TSDoc and linted with `eslint-plugin-tsdoc` + `eslint-plugin-tsdoc-require-2` at `error`.

## License

MIT
