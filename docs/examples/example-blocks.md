---
title: Example blocks
description: Why a bare @example breaks the TSDoc parser, and how convert fences only the bodies that need it.
order: 2
---

Sample code inside a comment looks harmless. To a TSDoc parser it is not: `{` starts an inline tag, `}` ends one, and `<`, `>` and `@` have meanings of their own. That makes a bare `@example` the largest single source of TSDoc errors in real projects, and none of them mean the documentation is wrong.

## Before

```ts
/**
 * Formats a price.
 *
 * @example
 * formatPrice({ amount: 12.5, currency: "USD" })
 *
 * @param {number} amount Amount to format
 * @param {string} currency ISO currency code
 * @returns {string} The formatted price
 */
```

The call contains `{ ... }`, so `check` reports:

```text
5:16    syntax  Expecting a TSDoc tag starting with "{@" (tsdoc-malformed-inline-tag)
5:48    syntax  The "}" character should be escaped using a backslash to avoid confusion with a TSDoc inline tag (tsdoc-escape-right-brace)
```

## After

````ts
/**
 * Formats a price.
 *
 * @example
 * ```typescript
 * formatPrice({ amount: 12.5, currency: "USD" })
 * ```
 *
 * @param amount - Amount to format
 * @param currency - ISO currency code
 * @returns The formatted price
 */
````

Inside a fence the parser reads the body literally, so braces stop being syntax.

## When it does not fence

The tool fences a body only if it contains one of the risky characters. This example stays exactly as written:

```ts
/**
 * Opens the docs.
 *
 * @example
 * openDocs("https://example.com/docs")
 */
```

It has no `{`, `<`, `>` or `@`, so there is nothing to fix and nothing is changed. The aim is to repair a parse error and not to impose a style. Two more cases are left alone:

- A body that **already contains a fence**, even one that opens with a caption in prose and fences only the code below it.
- A hazard **inside an inline code span**. TSDoc reads `` `{ retries: 3 }` `` literally, so a sentence that mentions `@param` in backticks is prose.

## A bare `@` in a sentence

The same idea applies outside `@example`. A path alias or a scoped package mentioned mid-sentence would start a tag, so the tool backticks it:

```diff
- * Imports from @/lib/thing and @scope/pkg.
+ * Imports from `@/lib/thing` and `@scope/pkg`.
```

A tag that opens a line is left alone, as is anything already inside a code span or a fence.

## See also

The [`convert` page](../convert.md) and [Reading check errors](./check-error-codes.md), for the rule ids these errors carry.
