---
title: Reading check errors
description: A field guide to the rule ids that check reports most often, what each one means, and the one-line fix.
order: 6
---

Each `syntax` line from `check` ends with a rule id in parentheses. They come from the TSDoc parser, so they are the same ids `eslint-plugin-tsdoc` shows in your editor. These are the ones that come up in almost every JSDoc migration.

| Rule id | What it says | Typical cause | Fix |
| ------- | ------------ | ------------- | --- |
| `tsdoc-undefined-tag` | The tag is not defined in this configuration | A JSDoc tag such as `@function`, `@return`, `@typedef` or `@property`, or a custom tag not in `tsdoc.json` | `convert` renames or removes the JSDoc ones. Register a real custom tag in `tsdoc.json` |
| `tsdoc-param-tag-with-invalid-type` | The `@param` block should not include a `{type}` | `@param {string} id` | `convert` strips the type |
| `tsdoc-param-tag-missing-hyphen` | A parameter name must be followed by a hyphen | `@param id The identifier` | `convert` inserts ` - ` |
| `tsdoc-param-tag-with-invalid-optional-name` | No `[ ]` around the name | `@param [retries=3] …` | `convert` removes the brackets, the default lives in the signature |
| `tsdoc-malformed-inline-tag` | Expecting a tag starting with `{@` | A `{` in prose or in unfenced sample code, such as `{ amount: 12.5 }` | Fence the `@example` body. `convert` does it when the body needs it |
| `tsdoc-escape-right-brace` | The `}` character should be escaped | The closing partner of the same `{` | The same fix, usually reported together with the previous one |
| `tsdoc-escape-greater-than` | The `>` character should be escaped | An unfenced `<T>` or `=>` in prose | Put it in backticks, or fence it |
| `tsdoc-characters-after-block-tag` | Characters directly after a block tag | `@returns{string}` style | Add a space, or remove the type |

## Two categories that have no rule id

| Line | Meaning | Fix |
| ---- | ------- | --- |
| `legacy  1 comment(s) still hold JSDoc syntax that convert would rewrite` | The comment still contains JSDoc that `convert` has a rule for | Run `convert` |
| `missing Missing TSDoc for fetchLead` | An export has no doc comment | Run `scaffold`, or write it |

## A method for a long report

A first `check` on an unmigrated project can print hundreds of lines. Do not read them in order.

1. Run `convert` first. Most `syntax` lines disappear, because they were JSDoc habits.
2. Run `check` again. What remains under `syntax` is either a custom tag or a real mistake.
3. For an unknown tag that is real (`@since`, `@author`), run `init` so it lands in `tsdoc.json`.
4. Run `scaffold` for the `missing` lines, then review the `TODO(tsdoc)` markers.

Keep the counts table at the end as the progress bar: the numbers should only go down.

## Machine-readable

```bash
npx jsdoc-to-tsdoc check --report=json
```

The JSON carries every finding with its file, position, category and rule id, plus `tsdocConfigs` listing every `tsdoc.json` that was applied. It is the right input for a dashboard or a script that opens issues.

## See also

The [`check` page](../check.md), and the tutorial [Add the TSDoc gate to CI](../tutorials/add-the-gate-to-ci.md).
