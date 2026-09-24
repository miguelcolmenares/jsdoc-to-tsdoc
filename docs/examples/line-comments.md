---
title: Promoting line comments
description: When a developer explained an export with // comments, convert can turn that prose into the doc comment it was already acting as.
order: 4
---

Not every explanation is in a `/** */` block. It is common to explain a constant with a couple of `//` lines above it. TSDoc cannot see those comments, so the export counts as undocumented, and `scaffold` would insert a generated stub between the person's words and the code.

## Before

```ts
// Revalidate once per day. Next.js route segment config
// must be a static literal.
export const revalidate = 86400;
```

`scan --classify` puts this file in **Line comments**, with the next action "prose to promote into `/** */`".

## The wrong fix: scaffold

```ts
// Revalidate once per day. Next.js route segment config
// must be a static literal.
/**
 * Revalidate.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 */
export const revalidate = 86400;
```

The file now holds an inferred "Revalidate." next to the sentence that already explained it better.

## The right fix

```bash
npx jsdoc-to-tsdoc convert --promote-line-comments
```

```ts
/**
 * Revalidate once per day. Next.js route segment config
 * must be a static literal.
 */
export const revalidate = 86400;
```

The words are the author's own. Nothing is recapitalised, repunctuated or summarised, and no summary is inferred.

## What it refuses to promote

| Run of comments | Why it is left alone |
| --------------- | -------------------- |
| Contains `// eslint-disable-next-line` or another directive | The directive stops working inside a block comment |
| Contains `*/` | It would close the new comment early |
| A bare `//` used as spacing | The empty comment it would produce satisfies the presence rule, and `check` would stop reporting the export without anything having been written |

The flag is off by default because it is the only part of `convert` that rewrites lines that were not comments TSDoc recognised. Run it with `--dry-run` first and read the diff.

## See also

The [`convert` page](../convert.md), the [`scaffold` page](../scaffold.md), and [`scan`](../scan.md) for the "Line comments" bucket.
