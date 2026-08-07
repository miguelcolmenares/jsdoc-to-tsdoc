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

# See where the project actually stands before changing anything
npx jsdoc-to-tsdoc scan --classify

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

# Documentation-gap gates (both imply --classify)
npx jsdoc-to-tsdoc scan --fail-on-missing
npx jsdoc-to-tsdoc scan --fail-on-stale

# Narrower gates — exit code 3 if a given command would change anything
npx jsdoc-to-tsdoc convert --check
npx jsdoc-to-tsdoc scaffold --check
npx jsdoc-to-tsdoc escalate --check
```

### Options

| Flag | Commands | Purpose |
| ------ | ---------- | --------- |
| `--cwd <dir>` | all | Project directory to scan (default `.`). |
| `--dry-run` / `--preview` | `init`, `convert`, `scaffold`, `escalate` | Show a diff without writing. |
| `--strict` | `init` | Start `tsdoc-require-2/require` at `error` instead of `warn`. |
| `--install` | `init` | Run the detected package manager to install missing dev dependencies. |
| `--check` | `convert`, `scaffold`, `escalate` | CI mode — exit `3` if anything would change; never writes. |
| `--interactive` / `-i` | `convert`, `scaffold` | Review each changed file — accept · skip · edit (in `$EDITOR`) · quit. Needs a TTY; not combinable with `--dry-run`/`--check`/`--report`. |
| `--lite` | `scan`, `convert` | Only `@param` / `@returns` hygiene; leave prose and structural tags. |
| `--promote-line-comments` | `convert` | Rewrite a run of `//` prose above an undocumented export as the `/** */` comment it was already serving as. Off by default. |
| `--severity <level>` | `escalate` | Target severity: `error` (default) or `warn` to walk it back. |
| `--skip-preflight` | `escalate` | Patch the config without running ESLint first. |
| `--syntax-only` | `check` | Only validate comment syntax; ignore undocumented exports and legacy JSDoc. |
| `--classify` | `scan` | Report documentation topology and confidence instead of the conversion inventory. Not combinable with `--lite`, which only narrows the inventory; passing both warns and ignores `--lite`. |
| `--fail-on-missing` | `scan` | Exit `3` when any export has no TSDoc comment (implies `--classify`). |
| `--fail-on-stale` | `scan` | Exit `3` when any comment contradicts its signature (implies `--classify`). |
| `--include-tests` | `check`, `scan --classify` | Also inspect the test paths `init` exempts from the TSDoc rules. |
| `--only <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to include (e.g. `"src/lib/**"`). |
| `--exclude <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to exclude (e.g. `"**/*.test.ts"`). |
| `--report <fmt>` | all | Machine-readable output: `json` or `md` (written to stdout). |

## What `init` does

Bootstraps a project for TSDoc without touching source comments:

- Scans the codebase for custom block tags and registers the recognized ones (`@since`, `@author`, `@version`) in a generated or merged `tsdoc.json`; unknown tags are reported for a manual decision.
- Patches the ESLint flat config (`defineConfig([…])`, `tseslint.config(…)`, or a bare array) with the TSDoc plugins and rules — `tsdoc/syntax` at `error`, `tsdoc-require-2/require` at `warn` (progressive), and `require-param` / `require-returns` at `off` to avoid known false positives on interfaces, types, and constants. The patch is idempotent and non-destructive; when the config shape is unrecognized it prints a copy-pasteable snippet.
- Detects the package manager and prints the exact dev-dependency install command (or runs it with `--install`).

Use `--strict` to lock the presence rule in at `error` from day one instead of the progressive `warn`.

## What `scan --classify` does

Answers the question that comes *before* the migration: what does this project's documentation actually look like, and where should the effort go?

Every exported declaration is classified, and each file lands in exactly one bucket — the **most severe** topology among its exports, because that is the one naming the next action:

| Topology | Meaning | Next action |
| ------ | ------ | ------ |
| **Valid TSDoc** | The comment covers what the signature declares | ready for `convert` |
| **Partial docs** | A comment, but part of the signature is undocumented | `convert`, then fill the gaps |
| **Line comments** | No doc comment, but `//` prose a human wrote | prose to promote into `/** */` |
| **No docs** | Nothing, or a plain `/* */` block | run `scaffold` |
| **Stale docs** | The comment contradicts the signature | manual review required |

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
Confidence: HIGH 84 · MEDIUM 12 · LOW 27 · STALE 4

Stale documentation — review these by hand:
  src/utils.ts:12 greet
    @param 'name' is not a parameter of greet (found: userId)
```

Stale documentation is **never rewritten automatically** — only reported. It is also detected conservatively, and deliberately so: a report that flags accurate documentation gets ignored, taking its true findings with it. Concretely, a destructured parameter (`function Card({ title, href }: CardProps)`) has no name in the source, so `@param title` cannot be told apart from a stale tag — parameter staleness is not judged for those signatures at all rather than guessed at.

Files that export nothing are counted apart from valid ones, which would otherwise overstate how much of the project is ready. Test paths are skipped by default, because the ESLint config `init` writes turns both TSDoc rules off for them.

The human report shows the summary plus the stale findings; `--report=json` carries the full per-declaration detail, gaps included.

## What `convert` does

Deterministic, formatting-preserving transformations derived from real-world migrations:

- Strips `{Type}` braces from `@param` / `@returns` / `@property`.
- Renames `@return` → `@returns`, `@template` → `@typeParam`, `@default` → `@defaultValue`.
- Removes `Promise<T>` wrappers from `@returns` descriptions.
- Removes JSDoc optional-parameter brackets: `@param [id=1]` → `@param id`.
- Inserts the mandatory `name - description` hyphen in `@param` / `@typeParam`.
- Converts `@access private` / `@private` → `@internal` (and `@protected` / `@public`).
- Converts `@module` / `@fileoverview` → `@packageDocumentation`, at most once per
  comment even when several file-level tags appear together (their prose is kept).
- Deletes TypeScript-redundant tags (`@function`, `@async`, `@class`, `@enum`, …) and JSDoc-only tags (`@typedef`, `@callback`, `@type`).
- Moves `@property` descriptions onto the members they document — on an `interface` or a `type` over an object literal — rather than deleting prose that exists nowhere else. See below.

- Wraps an `@example` body in a ```` ```typescript ```` fence when leaving it bare would break TSDoc parsing. See below.
- Backticks a bare `@` that appears mid-line in prose — a path alias (`@/lib/thing`), a scoped package (`@scope/pkg`), an address, or a decorator named in a sentence — so TSDoc reads it as text, not a tag. The tag that opens a line is left untouched, as is anything already inside a code span or a fenced block, and a standard tag name mentioned mid-prose.
- Folds a dotted `@param parent.child` (which TSDoc rejects) into its parent's description as a lossless `(child: description, …)` list, so the child documentation is preserved rather than dropped.

Content inside fenced code blocks (```` ```…``` ````) is never modified, so `@example` code is preserved verbatim.

### `@example` bodies are fenced only when they need it

An unfenced example is the single largest source of TSDoc errors in real code,
and none of them are about the documentation being wrong. A `{` in sample code
is read as the start of an inline tag and its `}` as the end of one, so a
comment that reads perfectly fails `check` with `tsdoc-malformed-inline-tag` and
`tsdoc-escape-right-brace`. The same goes for `<`, `>`, and an `@` anywhere —
including inside a word, as in an email address.

Only a body containing one of those is fenced. A body of plain calls and URLs is
left exactly as written, because the point is to fix a parse error, not to
impose a house style. Measured against the hand migration on a real repo, that
reproduces the human's decision on **101 of 102** examples; the one difference
is an example fenced that did not have to be, which is the safe direction to
err — an unfenced body that needed a fence is a `check` failure, while a fenced
one that did not is valid TSDoc rendering sample code as sample code.

A body that already contains a fence is left alone entirely, including one that
opens with a prose caption and fences only the code below it. Hazards inside an
inline code span (`` `{ retries: 3 }` ``) are not hazards — TSDoc reads a code
span literally — so a caption mentioning `@param` is prose, and stays prose.

### `@property` is never thrown away

TSDoc has no `@property` tag; a member is documented by its own comment. So the
tag has to go — but its description is usually the only copy of that prose, and
deleting it loses documentation the migration was supposed to preserve. Each tag
therefore ends up in one of three places:

| Situation | What happens |
| ----------- | -------------- |
| The member has no doc comment | The description is moved onto the member. |
| The member already has one | The tag is deleted as redundant; the member's own wording is left alone. |
| There is no such member, or the declaration has none at all | The description stays in the comment as a Markdown list item. |

```diff
  /**
   * Homepage banner data.
   *
- * @property title - Banner title (may contain HTML)
- * @property height - Banner minimum height in pixels
   */
  export interface HomepageBanner {
+   /** Banner title (may contain HTML) */
    title: string | null;
+   /** Banner minimum height in pixels */
    height: string | null;
  }
```

The third case covers shapes with nothing to attach a comment to — the element
type of an exported array literal, for instance. Keeping the tag verbatim would
survive `convert` only to fail `check` with `tsdoc-undefined-tag`, so the prose
is rewritten as `` - `name` — description `` instead, which is valid TSDoc and
says the same thing.

`convert` reports how many descriptions it moved, because it is the one change
that relocates text between declarations.

### `--promote-line-comments`

Some exports are documented with `//` prose that TSDoc cannot see. Left alone,
`scaffold` inserts a generated stub **between** that prose and the declaration —
so the file ends up with an inferred summary where the author's own explanation
was already sitting one line above:

```ts
// Revalidate once per day. Next.js route segment config
// must be a static literal — it cannot reference an imported constant.
/** Revalidate. */          // ← what scaffold adds
export const revalidate = 86400;
```

`convert --promote-line-comments` rewrites the run instead, keeping the words a
person wrote — no summary is inferred, and nothing is recapitalized or
repunctuated:

```ts
/**
 * Revalidate once per day. Next.js route segment config
 * must be a static literal — it cannot reference an imported constant.
 */
export const revalidate = 86400;
```

Only a run attached to an export with no doc comment is a candidate, and three
kinds of run are refused outright: one containing a tooling directive
(`// eslint-disable-next-line`), which stops working inside a block comment; one
containing `*/`, which would close the comment early; and one with no prose in
it, such as a bare `//` used as spacing — the empty `/** */` it would produce
satisfies the presence rule, so `check` would stop reporting the export as
undocumented without a word having been written. The promoted comment
goes through the same rules as any other, so a `@param {string}` typed out of
habit is normalized on the way in rather than left for the next run.

It is off by default, because it is the only part of `convert` that rewrites
lines which were not comments TSDoc recognized.

## What `scaffold` does

Generates a TSDoc stub for every exported declaration that has **no** documentation — in the real migrations this was ~80% of the work. Exports that already have a doc comment are never touched, and re-export statements (`export { x } from "./x"`) are skipped because the symbol is documented at its definition site.

Exports are found and classified through the TypeScript compiler API, so an `export` keyword inside a string or a nested scope is never mistaken for a declaration:

| Export shape | Generated stub |
| ------ | ------ |
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
| ------ | ------ |
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
npm run check   # format + typecheck + lint + test + the CLI's own `check` over this repo
npm run build   # bundle to dist/ via unbuild
npm run format  # prettier --write .
```

The CLI dogfoods the tooling it ships: it is documented with TSDoc, linted with `eslint-plugin-tsdoc` + `eslint-plugin-tsdoc-require-2` at `error`, and gated by its own `check` command (`npm run check:tsdoc`).

### Git hooks

`npm install` sets up Husky (`prepare`). Two hooks:

| Hook | What it does |
| ------ | -------------- |
| `pre-commit` | Blocks direct commits to `main` / `master`, then runs Prettier and ESLint over the staged files via lint-staged. |
| `pre-push` | Runs the whole gate — `npm run check`, including the dogfood. About 11 s. |

`pre-push` is where the expensive work goes: a commit is a checkpoint, a push is what CI and other people see. Because the gate includes `check:tsdoc`, a push cannot introduce a comment the CLI itself would reject. Use `git push --no-verify` for the rare case where you need to bypass it.

Prettier formats TypeScript and JSON, never Markdown — see [`.prettierignore`](./.prettierignore) for why, which is a real constraint in this repo rather than a preference.

## License

MIT
