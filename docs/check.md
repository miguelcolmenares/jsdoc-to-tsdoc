---
title: check
description: The CI gate that validates every TSDoc comment with the official parser, reports undocumented exports and legacy JSDoc, and never writes.
order: 8
---

`check` is the only command that validates instead of transforming, and it never writes. It is meant to run in CI, and it is what a clean migration looks like from the outside: `check` passes, the lint passes.

```bash
npx jsdoc-to-tsdoc check
```

## It uses the real parser

Comments are parsed with **`@microsoft/tsdoc`**, the same parser `eslint-plugin-tsdoc` runs. That is why a clean `check` predicts a clean lint, instead of merely resembling one.

## Three categories

| Category | Meaning | Fix |
| -------- | ------- | --- |
| `syntax` | The parser rejected the comment | `convert` handles most, the rest is manual |
| `missing` | An export has no doc comment | `scaffold` |
| `legacy` | The comment still holds JSDoc that `convert` would rewrite | `convert` |

## Reading the output

On a project that has not been migrated yet, the output looks like this (shortened):

```text
src/lib/api.ts
  1:1     legacy  1 comment(s) still hold JSDoc syntax that `convert` would rewrite.
  4:4     syntax  The TSDoc tag "@function" is not defined in this configuration (tsdoc-undefined-tag)
  5:11    syntax  The @param block should not include a JSDoc-style '{type}' (tsdoc-param-tag-with-invalid-type)
  6:4     syntax  The @param block should be followed by a parameter name and then a hyphen (tsdoc-param-tag-missing-hyphen)
  15:1    missing Missing TSDoc for Lead.
┌─────────────────────────┬───────┐
│ Files scanned           │     4 │
│ Files with problems     │     4 │
│ TSDoc syntax errors     │    27 │
│ Exports without TSDoc   │     6 │
│ Files with legacy JSDoc │     3 │
└─────────────────────────┴───────┘
✗ 36 problem(s) across 4 file(s).
Run `jsdoc-to-tsdoc scaffold` to stub the missing documentation.
Run `jsdoc-to-tsdoc convert` to finish the JSDoc migration.
```

Each line is `line:column`, the category, the message, and for syntax problems the TSDoc rule id in parentheses. The last lines name the command that fixes what was found, and after `convert` and `scaffold` the same project reports:

```text
✓ TSDoc is valid and complete.
```

The Examples section has a table that maps each rule id to what it means and how to fix it.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Clean |
| `2` | A `tsdoc.json` exists but cannot be read, so nothing was inspected |
| `3` | Problems found |

Exit `2` is deliberate. Reporting thousands of bogus problems because the config could not be loaded is worse than stopping, so `check` stops. A project that simply has no `tsdoc.json` yet is not an error.

## Two behaviours that keep the gate honest

- **The nearest `tsdoc.json` is loaded first, per file.** Without it every `@since` in a real codebase would be reported as an undefined tag, which the project's own lint accepts.
- **Test paths are skipped by default**, because the config `init` generates turns both rules off for them. A gate that reported what the tool's own scaffolding excuses would be reporting phantom work. `--include-tests` opts back in.

## Monorepos: a `tsdoc.json` per package

A workspace can give each package its own `tsdoc.json`, with its own custom tags. `check` resolves the config for each file by walking up from that file's directory toward the project root and using the nearest one, the same model ESLint's flat config and `tsconfig.json` use.

```text
root/
├── tsdoc.json              # defines @internalOnly
└── packages/
    ├── api/
    │   ├── tsdoc.json       # defines @endpoint, on top of the root's tags
    │   └── src/handler.ts   # resolves to packages/api/tsdoc.json
    └── ui/
        └── src/button.tsx   # no override here, resolves to the root tsdoc.json
```

`handler.ts` can use `@endpoint`, and `button.tsx` cannot: the walk finds nothing under `packages/ui/`, continues, and lands on the root file, which never defined that tag. Nothing above the directory `--cwd` points at is ever considered, so a stray `tsdoc.json` outside the repository cannot leak in. A config that exists but fails to load, anywhere in the tree, aborts the whole run with exit `2` and names the file. `--report=json` lists every config actually applied as `tsdocConfigs`.

Only `check` resolves configs this way today. `init`, `convert`, `scaffold` and `escalate` still assume one project-wide `tsdoc.json` and one ESLint config.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--syntax-only` | Only validate comment syntax, ignore missing exports and legacy JSDoc |
| `--include-tests` | Also inspect test paths |
| `--only <globs>`, `--exclude <globs>` | Limit the files |
| `--report <fmt>` | `json` or `md` on stdout |
| `--cwd <dir>` | Project directory, default `.` |

## See also

- [Reading check errors](./examples/check-error-codes.md), a guide to the rule ids.
- [A tsdoc.json per package](./examples/monorepo-tsdoc-json.md), for workspaces.
- [CI integration](./ci-integration.md) and the tutorial [Add the TSDoc gate to CI](./tutorials/add-the-gate-to-ci.md).
