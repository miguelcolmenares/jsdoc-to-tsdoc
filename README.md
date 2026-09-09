# jsdoc-to-tsdoc

CLI tool to migrate JSDoc comments to the [TSDoc](https://tsdoc.org/) standard in TypeScript projects.

> **Status: Alpha.** Published on npm as [`jsdoc-to-tsdoc`](https://www.npmjs.com/package/jsdoc-to-tsdoc). Every command in the CLI contract ships: the full `init → convert → scaffold → escalate` workflow plus the `check` CI gate, dogfooded end-to-end on a 5th real repo. See [`CHANGELOG.md`](./CHANGELOG.md) for release history and [open issues labeled `future`](https://github.com/miguelcolmenares/jsdoc-to-tsdoc/issues?q=is%3Aissue+is%3Aopen+label%3Afuture) for what's deliberately deferred.

## The Problem

TypeScript projects commonly use JSDoc-style documentation comments that include type annotations (`{string}`, `{boolean}`), redundant tags (`@function`, `@typedef`, `@callback`), and non-standard tags. These are incompatible with the [TSDoc specification](https://tsdoc.org/) and cause lint errors when `eslint-plugin-tsdoc` is enabled.

There is **no existing tool** to automate this migration end to end — see [`AGENTS.md`](./AGENTS.md) for the CLI's own architecture and design decisions.

## Installation

There isn't one, and that is deliberate. `jsdoc-to-tsdoc` is a **migration
tool, not a library**: nothing in your project imports it, nothing at build or
lint time calls it, and once the migration is done there is nothing left for it
to do. Run it with your package runner:

```bash
npx jsdoc-to-tsdoc <command>          # npm
yarn dlx jsdoc-to-tsdoc <command>     # Yarn
pnpm dlx jsdoc-to-tsdoc <command>     # pnpm
```

All three are tested against a packed tarball, on real projects, not assumed
equivalent — `yarn dlx` was broken until recently for a reason none of the
others shared.

Every release also mirrors to [GitHub Packages](https://github.com/miguelcolmenares/jsdoc-to-tsdoc/pkgs/npm/jsdoc-to-tsdoc)
as `@miguelcolmenares/jsdoc-to-tsdoc` — useful if your environment already
authenticates against `npm.pkg.github.com` and you'd rather not add npmjs.com
as a second registry. npmjs.com stays the primary, documented target; the
mirror carries the same version, published from the same release.

**Do not add it to `dependencies` or `devDependencies`.** Installed, it pins a
finished migration tool into a dependency graph where it shows up in every
audit, every Dependabot pass and every lockfile diff, for a command run by hand
a few times a year.

### What *does* belong in your devDependencies

`init` reports four packages, and those are a different thing entirely — they
are the **lint gate this tool leaves behind**, and ESLint loads them on every
run forever:

```bash
npm install -D @microsoft/tsdoc @microsoft/tsdoc-config \
  eslint-plugin-tsdoc eslint-plugin-tsdoc-require-2
```

The distinction is the one place this is easy to get wrong: `init` installs
dev dependencies, so it is a fair assumption that `init` *is* one. It is not.
Those four run your lint; the CLI runs once.

### Using `check` in CI

`check` is the one command with a standing role, and it still does not belong
in `package.json`. Pin the version in the workflow instead, so CI is
reproducible without the tool entering your dependency graph:

```yaml
# Pin the version so a CI run is reproducible; the tool never enters
# package.json, so nothing has to be installed for this step.
- run: npx jsdoc-to-tsdoc@<version> check
```

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
| `--interactive` / `-i` | `convert`, `scaffold` | Review each changed file — accept · skip · edit (in `$EDITOR`) · quit. Needs a TTY (stdin and stdout); not combinable with `--dry-run`/`--preview`/`--check`/`--report`. |
| `--lite` | `scan`, `convert` | Only `@param` / `@returns` hygiene; leave prose and structural tags. |
| `--promote-line-comments` | `convert` | Rewrite a run of `//` prose above an undocumented export as the `/** */` comment it was already serving as. Off by default. |
| `--members` | `scaffold` | Also stub each undocumented interface (or type-literal alias) member, one comment each, in addition to the declaration's own header. Off by default. |
| `--severity <level>` | `escalate` | Target severity: `error` (default) or `warn` to walk it back. |
| `--skip-preflight` | `escalate` | Patch the config without running ESLint first. |
| `--syntax-only` | `check` | Only validate comment syntax; ignore undocumented exports and legacy JSDoc. |
| `--classify` | `scan` | Report documentation topology and confidence instead of the conversion inventory. Not combinable with `--lite`, which only narrows the inventory; passing both warns and ignores `--lite`. |
| `--fail-on-missing` | `scan` | Exit `3` when any export has no TSDoc comment (implies `--classify`). |
| `--fail-on-stale` | `scan` | Exit `3` when any comment contradicts its signature (implies `--classify`). |
| `--include-tests` | `check`, `scaffold`, `scan --classify` | Also inspect the test paths `init` exempts from the TSDoc rules. |
| `--only <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to include (e.g. `"src/lib/**"`). |
| `--exclude <globs>` | `scan`, `convert`, `scaffold`, `check` | Comma-separated globs to exclude (e.g. `"**/*.test.ts"`). |
| `--report <fmt>` | all | Machine-readable output: `json` or `md` (written to stdout). |
| `--enrich <provider>` | `scan` | Ask an LLM to suggest documentation for LOW-confidence and STALE exports (implies `--classify`): `copilot`, `ollama`, or `anthropic`. **Off by default.** |

### Which commands look at test files

Not all of them, and the split is deliberate — `init` writes an ESLint config
that turns `tsdoc/syntax` and `tsdoc-require-2/require` **off** for test paths,
so a command's default should match what that config grades.

| Command | Test paths | Why |
| ------ | ------ | ------ |
| `check` | skipped | It is a gate. Reporting what `init`'s own config excuses is phantom work. |
| `scaffold` | skipped | It *writes*. A stub in an ungraded file is a `TODO(tsdoc)` nothing will ever ask anyone to fill. |
| `scan --classify` | skipped | It measures how well exports are documented — the same question `check` gates on. |
| `scan` (inventory) | included | It counts what `convert` would rewrite. |
| `convert` | included | It rewrites JSDoc that is already there rather than creating an obligation, and malformed JSDoc is malformed wherever it lives. |

`--include-tests` opts the first three back in. There is no flag to opt
`convert` out, because `--exclude` already does that: `convert --exclude "**/*.test.ts,**/__tests__/**"`.

## What `init` does

Bootstraps a project for TSDoc without touching source comments:

- Scans the codebase for custom block tags and registers the recognized ones (`@since`, `@author`, `@version`) in a generated or merged `tsdoc.json`; unknown tags are reported for a manual decision. Hyphenated tokens are not reported: a TSDoc tag name cannot contain a hyphen, so `@jest-environment` and `@ts-check` are another tool's pragmas sharing the comment, and neither registering nor removing them is right.
- Patches the ESLint flat config with the TSDoc plugins and rules: `tsdoc/syntax` at `error`, `tsdoc-require-2/require` at `warn` (progressive), and `require-param` / `require-returns` at `off` to avoid known false positives on interfaces, types, and constants. Four config shapes are recognized, each in two forms:

  | Shape | Example |
  | ------ | ------ |
  | `defineConfig` with an array | `export default defineConfig([ … ])` |
  | `defineConfig`, variadic | `export default defineConfig(a, b, c)` |
  | `tseslint.config(…)` | `export default tseslint.config(…)` |
  | a bare array | `export default [ … ]` |

  Each is also recognized assigned to a variable that is then default-exported
  — `const eslintConfig = [ … ]` followed by `export default eslintConfig`,
  which is what `create-next-app` scaffolds.

  The patch is idempotent and non-destructive; when the shape is unrecognized it prints a copy-pasteable snippet.
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
┌─────────────────────┬───────┐
│ Valid TSDoc         │    84 │
│ Partial docs        │    12 │
│ Line comments       │     8 │
│ No docs             │    19 │
│ Stale docs          │     4 │
│ Nothing to document │     0 │
└─────────────────────┴───────┘
Confidence: HIGH 84 · MEDIUM 12 · LOW 27 · STALE 4

Stale documentation — review these by hand:
  src/utils.ts:12 greet
    @param 'name' is not a parameter of greet (found: userId)
```

Stale documentation is **never rewritten automatically** — only reported. It is also detected conservatively, and deliberately so: a report that flags accurate documentation gets ignored, taking its true findings with it. Concretely, a destructured parameter (`function Card({ title, href }: CardProps)`) has no name in the source, so `@param title` cannot be told apart from a stale tag — parameter staleness is not judged for those signatures at all rather than guessed at.

Files with nothing to document are counted apart from valid ones, which would otherwise overstate how much of the project is ready. Two kinds land there: a file that declares nothing exported, and a barrel that only re-exports — `export * from "./x.js"` exports plenty while declaring nothing this tool can attach a comment to. They share a bucket because they share an answer: there is no work here.

`--report=json` lists **every** scanned file, including those, with `topology: null`. `files.length` always equals `filesScanned`, so the array can be reconciled against the totals. Test paths are skipped by default, because the ESLint config `init` writes turns both TSDoc rules off for them.

The human report shows the summary plus the stale findings; `--report=json` carries the full per-declaration detail, gaps included.

## What `scan --classify --enrich` does

**Off by default.** `scan --classify` never calls an LLM on its own — this is
the opt-in second opinion for the two buckets a person still has to act on by
hand: LOW-confidence exports (`No docs`, `Line comments`) and `Stale docs`.
Passing `--enrich=copilot|ollama|anthropic` implies `--classify`; omitting the
flag entirely means the command never imports, constructs, or calls into the
provider code at all — the deterministic pipeline (`scaffold`'s name
inference, `convert`'s mechanical rewrites) stays fully usable with zero LLM
dependency either way.

```bash
npx jsdoc-to-tsdoc scan --classify --enrich=ollama
```

| Provider | Needs | Notes |
| ------ | ------ | ------ |
| `copilot` | The GitHub Copilot CLI (`copilot`) on `$PATH` | No API key managed by this tool — the CLI handles its own auth. |
| `ollama` | A local Ollama daemon (`ollama serve`) | No API key. Reads `OLLAMA_HOST` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.1`). |
| `anthropic` | `ANTHROPIC_API_KEY` in the environment | Also needs `@anthropic-ai/sdk` installed — see below. Reads `ANTHROPIC_MODEL` (default `claude-opus-5`). |

A suggestion is a proposal, never a write: `scan` stays read-only, and the
suggested comment is surfaced as an additional `enrichment` field on the
flagged declaration in the human table, `--report=json`, and `--report=md` —
nothing here writes to a source file. A provider that is not set up — the CLI
missing, the daemon unreachable, no API key — reports each target it could not
enrich rather than crashing the command:

```text
Enrichment (--enrich=ollama) — 0/1 suggestion(s):
Enrichment unavailable for 1 entry: Ollama is not reachable at http://localhost:11434: fetch failed
```

`@anthropic-ai/sdk` is a `devDependency` of this package, not a `dependency` —
it is imported only from inside the `anthropic` provider, behind a dynamic
`import()`, so a project that never passes `--enrich=anthropic` does not
download it and it never enters the published bundle. To use
`--enrich=anthropic`, install it yourself: `npm install @anthropic-ai/sdk`
(or `-D`, since it is only needed at the moment the flag runs).

## What `convert` does

Deterministic, formatting-preserving transformations derived from real-world migrations:

- Strips `{Type}` braces from `@param` / `@returns` / `@property`.
- Rewrites a thrown type into TSDoc's link form: `@throws {SyntaxError}` → `@throws {@link SyntaxError}`. Unlike `@param`, the braces are not simply stripped — the thrown type appears in no signature, so removing it would delete the only thing the tag says. A type that could never resolve (a primitive, a union, a generic) becomes plain prose instead of a link that would render broken.
- Renames `@return` → `@returns`, `@template` → `@typeParam`, `@default` → `@defaultValue`, `@exception` → `@throws`.
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

### `--members`

By default `scaffold` only documents an interface's (or type-literal alias's) own header — `export interface HeroSectionProps` gets one stub, "Hero section props.", regardless of how many properties it declares. `--members` additionally stubs every undocumented member of that declaration, one comment each, inferred the same deterministic way as a top-level export — from the member's own name and its declared type, never a guess at what it means:

```ts
export interface HeroSectionProps {
  /** The title. */
  title: string;
  href: string;
  onSelect: (id: string) => void;
}
```

```bash
$ npx jsdoc-to-tsdoc scaffold --members
```

```ts
export interface HeroSectionProps {
  /** The title. */
  title: string; // already documented — left alone
  /**
   * Href.
   *
   * @remarks TODO(tsdoc): verify this generated summary.
   */
  href: string;
  /**
   * On select.
   *
   * @remarks TODO(tsdoc): verify this generated summary.
   *
   * @param id - TODO(tsdoc): describe id.
   */
  onSelect: (id: string) => void;
}
```

A member whose declared type is callable — a method signature or a property typed as a function, like `onSelect` above — gets `@param`/`@returns` tags the same way a function declaration would; the summary sentence itself still comes from the same name-inference heuristics every stub uses, so `onSelect` reads as a plain noun phrase ("On select.") rather than a verb sentence, because `on` isn't a recognized leading verb. A plain data property, like `href`, gets a noun-phrase summary the same way. A member that already has its own doc comment is left untouched (`title` above), independent of whether the interface's own header is documented — the two are separate gaps, and `--members` closes both.

It applies to type-literal aliases (`export type Options = { … }`) the same way, since the scanner already treats the two identically for member purposes (the same mechanism `convert` uses to relocate an existing `@property` description onto a member).

**Off by default**, because it can meaningfully multiply how much boilerplate one run produces — a wide interface goes from one stub to one per property — matching how `convert --promote-line-comments` stays opt-in for the same reason.

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

### Automatic conflict resolution for the escalation line

That one-line diff is also the only line that ever *conflicts* on a long-lived escalation branch — two branches (or a branch and a rebased `main`) each flip the same rule, and a plain `git rebase`/`merge` stops to ask a human to pick `"warn"` or `"error"` on a line where the answer is always "whichever one is `error`". The `merge-driver` subcommand is a [git merge driver](https://git-scm.com/docs/gitattributes#_defining_a_custom_merge_driver) that resolves exactly that conflict and nothing else: if the two conflicting versions of the file differ *only* in that one severity value, it writes back whichever side already escalated to `"error"`; if anything else on the file differs too, it makes no changes and exits non-zero so git falls back to `git merge-file`'s normal conflict markers — the same markers you would get with no driver configured at all.

Unlike the other commands, `merge-driver` is never run by hand — `git` invokes it per its [merge-driver file protocol](https://git-scm.com/docs/gitattributes#_defining_a_custom_merge_driver), passing the common-ancestor, "ours", and "theirs" versions of the file as three temporary paths. Wiring it into a repository is a **one-time, local setup step**, not something a committed file alone can do — git deliberately does not let a `.gitattributes` line register an executable on its own, since that would let a cloned repository run arbitrary commands during `git merge` with no consent. Two things, both scoped to the file `init` already writes:

1. Commit a `.gitattributes` entry naming the driver:

   ```text
   eslint.config.mjs merge=jsdoc-to-tsdoc-severity
   ```

2. Each contributor registers the driver once, locally (this is the step that can't be committed):

   ```bash
   git config merge.jsdoc-to-tsdoc-severity.driver "npx jsdoc-to-tsdoc merge-driver %O %A %B"
   ```

After that, a `git rebase` or `git merge` that only conflicts on the severity line resolves silently; anything else still stops for review exactly as it does today. `init`/`generator` do **not** wire this up automatically — running an arbitrary command during every future merge is a decision this project leaves to the human who owns the repository, not something the CLI grants itself as a side effect of bootstrapping.

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

- **The nearest `tsdoc.json` is loaded first, per file.** Without it every `@since` in a real codebase is reported as an undefined tag — violations the project's own lint accepts. If that file exists but cannot be read, `check` exits `2` and inspects nothing, because reporting thousands of bogus problems is worse than stopping. A project that simply has no `tsdoc.json` yet is not an error.
- **Test paths are skipped by default**, because the ESLint config `init` generates turns both TSDoc rules off for them. A gate that reported what the tool's own scaffolding excuses would be reporting phantom work. `--include-tests` opts back in.

Exit codes: `0` clean · `2` unreadable `tsdoc.json` · `3` problems found.

### Monorepo: a `tsdoc.json` per package

A workspace can give each package its own `tsdoc.json` — its own custom tags, its own scope — instead of sharing one project-root file. `check` resolves the config for each file by walking up from the file's own directory toward the project root and using the nearest `tsdoc.json` it finds, the same **nearest-ancestor** model ESLint's flat config and TypeScript's `tsconfig.json` both use. A file with no closer override falls back to the project root's `tsdoc.json`, exactly as it would in a single-package project.

```text
root/
├── tsdoc.json              # defines @internal-only
└── packages/
    ├── api/
    │   ├── tsdoc.json       # defines @endpoint, on top of the root's tags
    │   └── src/handler.ts   # resolves to packages/api/tsdoc.json
    └── ui/
        └── src/button.tsx   # no override here — resolves to the root tsdoc.json
```

`packages/api/src/handler.ts` can use `@endpoint` because the nearest `tsdoc.json` walking up from it is `packages/api/tsdoc.json`. `packages/ui/src/button.tsx` cannot — the walk finds nothing under `packages/ui/`, continues past it, and lands on the root's `tsdoc.json`, which never defined that tag. Nothing above the project root (the directory `--cwd` points at) is ever considered, so a `tsdoc.json` sitting outside the repo can't leak in.

A `tsdoc.json` that exists but fails to load — anywhere in the tree, root or nested — still aborts the whole run with exit `2` before anything is reported, and names which one: a config that can't be trusted makes every file under it as untrustworthy as a broken root config always was. `--report=json` lists every config actually applied as `tsdocConfigs`, alongside the existing single-path `tsdocConfig` (the project root's own).

**Only `check` resolves configs this way today.** `init`, `convert`, `scaffold` and `escalate` still assume one project-wide `tsdoc.json` and one ESLint flat config; making those per-workspace-aware is tracked separately (see `AGENTS.md` §11) since "which flat config applies to which workspace" is a different, harder question than "which `tsdoc.json` applies to which file."

## CI integration

`check` and `scan --fail-on-missing`/`--fail-on-stale` are meant to run as a
CI gate (see [Using `check` in CI](#using-check-in-ci) above). Two prebuilt
wrappers exist so a consuming repo doesn't have to hand-roll the `npx`
invocation and exit-code handling itself — both just shell out to
`npx jsdoc-to-tsdoc@<version> <command> <flags>` and propagate the CLI's own
exit code (`0` OK · `1` logic error · `2` parse failure · `3` violations) as
their own success/failure.

### GitHub Action

A composite action at the repo root (`action.yml`), usable directly as
`miguelcolmenares/jsdoc-to-tsdoc@main` (or pin a tag once one is cut):

```yaml
# .github/workflows/tsdoc.yml
name: TSDoc

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: miguelcolmenares/jsdoc-to-tsdoc@main
        with:
          command: check
          version: "0.2.1" # pin for a reproducible gate
```

Or the documentation-gap gate:

```yaml
      - uses: miguelcolmenares/jsdoc-to-tsdoc@main
        with:
          command: scan
          version: "0.2.1"
          fail-on-missing: "true"
          fail-on-stale: "true"
```

Inputs: `command` (`check` or `scan`, default `check`), `version` (npm
version to run via `npx`, default `latest`), `node-version` (default `22`),
`cwd`, `fail-on-missing` / `fail-on-stale` (`scan` only), `syntax-only`
(`check` only), `include-tests`, `only`, `exclude`, `report`. Output:
`exit-code`, the CLI's own exit code, for a step that wants to inspect it
without failing the job. See [`action.yml`](./action.yml) for the full list.

### Bitbucket Pipe

> **Not yet published.** [`pipe/`](./pipe/) ships a buildable, correct
> Dockerfile / `pipe.yml` / `pipe.sh` — it is **not** on the Bitbucket Pipe
> marketplace or any Docker registry yet. That needs the maintainer's own
> Docker Hub/registry and Atlassian Marketplace accounts, which this
> repository does not have. See
> [`pipe/README.md`](./pipe/README.md#publish-checklist-maintainer-only--not-run-by-this-pr)
> for the exact steps still to run, and
> [`.github/workflows/verify-ci-integrations.yml`](./.github/workflows/verify-ci-integrations.yml)
> for how it is verified in the meantime (`docker build` + a smoke run against
> this repo's own source, in GitHub Actions — there is no way to exercise it
> through actual Bitbucket Pipelines from here).

Once published, usage will look like:

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: jsdoc-to-tsdoc check
        script:
          - pipe: miguelcolmenares/jsdoc-to-tsdoc-pipe:0.1.0
            variables:
              COMMAND: "check"
              VERSION: "0.2.1"
```

Variables mirror the GitHub Action's inputs (`COMMAND`, `VERSION`, `CWD`,
`FAIL_ON_MISSING`, `FAIL_ON_STALE`, `SYNTAX_ONLY`, `INCLUDE_TESTS`, `ONLY`,
`EXCLUDE`, `REPORT`) — see [`pipe/pipe.yml`](./pipe/pipe.yml).

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
