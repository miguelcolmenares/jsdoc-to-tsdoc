---
title: scan
description: Inventory the JSDoc a migration would touch, or classify how well every export is documented, without writing anything.
order: 4
---

`scan` is read-only. It answers the questions that come before a migration: how much JSDoc is there, and how good is the documentation the project already has?

## The inventory

```bash
npx jsdoc-to-tsdoc scan
```

```text
┌─────────────────────┬───────┐
│ Files scanned       │     4 │
│ Files with JSDoc    │     3 │
│ Comments total      │     3 │
│ Comments to convert │     3 │
│ Files to change     │     3 │
└─────────────────────┴───────┘
Run `jsdoc-to-tsdoc convert --dry-run` to preview changes.
```

This is what `convert` would rewrite, counted. `--lite` narrows it to `@param` and `@returns` hygiene.

## Classify: where should the effort go?

```bash
npx jsdoc-to-tsdoc scan --classify
```

Every exported declaration is classified, and each file lands in exactly one bucket, the **most severe** one among its exports, because that is the bucket that names the next action.

| Topology | Meaning | Next action |
| -------- | ------- | ----------- |
| Valid TSDoc | The comment covers what the signature declares | Ready for `convert` |
| Partial docs | A comment exists, but part of the signature is undocumented | `convert`, then fill the gaps |
| Line comments | No doc comment, but `//` prose a person wrote | Promote it into `/** */` |
| No docs | Nothing, or a plain `/* */` block | Run `scaffold` |
| Stale docs | The comment contradicts the signature | Manual review |

A run on a small project:

```text
Documentation analysis — 4 file(s) scanned
┌─────────────────────┬───────┐
│ Valid TSDoc         │     1 │
│ Partial docs        │     0 │
│ Line comments       │     1 │
│ No docs             │     2 │
│ Stale docs          │     0 │
│ Nothing to document │     0 │
└─────────────────────┴───────┘
  Valid TSDoc        1 file(s) → ready for `convert`
  Line comments      1 file(s) → prose to promote into `/** */`
  No docs            2 file(s) → run `scaffold`
Confidence: HIGH 1 · MEDIUM 0 · LOW 3 · STALE 0
```

The last column of each row is the answer to "what do I do about it".

### Confidence

The confidence line counts exports, not files. **HIGH** is a comment that covers its signature, **MEDIUM** is a partial one, **LOW** is `No docs` or `Line comments`, and **STALE** is a contradiction.

### Stale documentation is only reported

```text
Stale documentation — review these by hand:
  src/utils.ts:12 greet
    @param 'name' is not a parameter of greet (found: userId)
```

The tool never rewrites stale documentation, because it cannot know whether the comment or the code is the one that is right. It is also detected conservatively on purpose: a report that flags accurate documentation gets ignored, and takes its true findings with it. A destructured parameter such as `function Card({ title, href }: CardProps)` has no name in the source, so parameter staleness is not judged for that signature at all.

### Nothing to document

Files that declare nothing exported, and barrels that only re-export (`export * from "./x.js"`), are counted apart from the valid ones. They would otherwise overstate how much of the project is ready.

### Test files

`scan --classify` skips test paths by default, because the ESLint config that `init` writes turns both TSDoc rules off for them. `--include-tests` brings them back. The plain inventory does include them, because it counts what `convert` would rewrite and `convert` rewrites malformed JSDoc wherever it lives.

## Gates

```bash
npx jsdoc-to-tsdoc scan --fail-on-missing   # exit 3 if any export has no TSDoc comment
npx jsdoc-to-tsdoc scan --fail-on-stale     # exit 3 if any comment contradicts its signature
```

Both imply `--classify`. They suit a pipeline that should fail on documentation gaps but does not yet run the full `check`.

## Reports

`--report=json` and `--report=md` write a machine-readable version to stdout. The JSON lists **every** scanned file, including the ones with nothing to document (their `topology` is `null`), so `files.length` always equals `filesScanned` and the array can be reconciled against the totals.

## Optional: suggestions from a language model

`scan --classify --enrich=<provider>` asks a model for a suggested comment for the two buckets a person still has to act on: LOW-confidence exports and stale docs. It is **off by default**, and the command never loads any provider code unless you pass the flag.

| Provider | Needs |
| -------- | ----- |
| `copilot` | The GitHub Copilot CLI (`copilot`) on your `PATH`, which handles its own authentication |
| `ollama` | A local Ollama daemon. Reads `OLLAMA_HOST` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.1`) |
| `anthropic` | `ANTHROPIC_API_KEY` in the environment, and `@anthropic-ai/sdk` installed in your project |

A suggestion is a proposal and never a write. It appears next to the flagged declaration in the table and in the JSON and Markdown reports, and no source file is touched. A provider that is not set up is reported per target and does not crash the command.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--classify` | Report topology and confidence instead of the inventory |
| `--fail-on-missing`, `--fail-on-stale` | Exit `3` on gaps, imply `--classify` |
| `--enrich <provider>` | Model suggestions for LOW and STALE, implies `--classify` |
| `--lite` | Inventory only `@param` and `@returns` hygiene. Not combinable with `--classify` |
| `--include-tests` | Also inspect test paths, with `--classify` |
| `--only <globs>`, `--exclude <globs>` | Comma-separated globs |
| `--report <fmt>` | `json` or `md` |

## See also

- [`convert`](./convert.md) and [`scaffold`](./scaffold.md), the commands the classification points at.
- [Promoting line comments](./examples/line-comments.md), for the "Line comments" bucket.
- [Add the TSDoc gate to CI](./tutorials/add-the-gate-to-ci.md), for `--fail-on-missing` and `--fail-on-stale`.
