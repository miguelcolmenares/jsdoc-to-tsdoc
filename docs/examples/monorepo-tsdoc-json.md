---
title: A tsdoc.json per package
description: How check picks a tsdoc.json in a monorepo, with a worked example of a tag that resolves in one package and not in its neighbour.
order: 7
---

In a workspace, packages often need different custom tags. `check` supports that by resolving the configuration **per file**, walking up from the file's directory until it finds a `tsdoc.json`.

## The layout

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

## The configs

The root defines the tag every package may use:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  "tagDefinitions": [{ "tagName": "@internalOnly", "syntaxKind": "block" }]
}
```

The API package adds its own on top:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  "extends": ["../../tsdoc.json"],
  "tagDefinitions": [{ "tagName": "@endpoint", "syntaxKind": "block" }]
}
```

## What resolves where

| File | Nearest `tsdoc.json` | `@endpoint` | `@internalOnly` |
| ---- | -------------------- | ----------- | ---------------- |
| `packages/api/src/handler.ts` | `packages/api/tsdoc.json` | accepted | accepted, through `extends` |
| `packages/ui/src/button.tsx` | `tsdoc.json` at the root | reported as an undefined tag | accepted |

Both files use `@endpoint` and `@internalOnly`, and one `check` from the root reports:

```text
packages/ui/src/button.tsx
  4:4     syntax  The TSDoc tag "@endpoint" is not defined in this configuration (tsdoc-undefined-tag)
```

`handler.ts` is clean. `button.tsx` cannot use `@endpoint`. The walk finds nothing under `packages/ui/`, continues upward, and stops at the root file, which never defined that tag. That is the correct answer, since it is exactly what `eslint-plugin-tsdoc` would say for that file.

A tag name is letters and numbers only, so `@internalOnly` is valid and `@internal-only` is not. `check` refuses to run at all with a config that defines the latter, and exits `2`.

## Rules of the walk

- The walk stops at the directory `--cwd` points at. A `tsdoc.json` outside the repository can never leak in.
- A config that exists but fails to load, anywhere in the tree, aborts the whole run with exit `2` and names the file. A config that cannot be trusted makes every file under it just as untrustworthy.
- A project with no `tsdoc.json` at all is not an error.
- `--report=json` lists every config that was applied as `tsdocConfigs`.

## What is not per package yet

Only `check` resolves configs this way. `init`, `convert`, `scaffold` and `escalate` still assume one project-wide `tsdoc.json` and one ESLint flat config. In a workspace, run them once per package with `--cwd`:

```bash
npx jsdoc-to-tsdoc convert --cwd packages/api
npx jsdoc-to-tsdoc convert --cwd packages/ui
npx jsdoc-to-tsdoc check
```

## See also

The [`check` page](../check.md) and [`init`](../init.md), which writes the root `tsdoc.json`.
