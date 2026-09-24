---
title: Stubs for undocumented exports
description: What scaffold generates for components, interfaces and functions, and how the marker makes the review a search.
order: 5
---

After `convert`, what is left is code that nobody documented. This example follows a small module through `scaffold`, so you can see what a stub contains and what it does not.

## Before

```tsx
export interface HeroProps {
  title: string;
  href: string;
  onSelect: (id: string) => void;
}

export default function Hero({ title, href }: HeroProps) {
  return <a href={href}>{title}</a>;
}
```

```ts
export interface Lead {
  id: string;
  email: string;
}

export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-");
}

export const isEmpty = (value: string) => value.length === 0;
```

## Preview

```bash
npx jsdoc-to-tsdoc scaffold --dry-run
```

## After `scaffold`

```tsx
/**
 * Hero props.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 */
export interface HeroProps {
  title: string;
  href: string;
  onSelect: (id: string) => void;
}

/**
 * Renders the hero.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 *
 * @param props - TODO(tsdoc): describe props.
 * @returns TODO(tsdoc): describe the return value.
 */
export default function Hero({ title, href }: HeroProps) {
  return <a href={href}>{title}</a>;
}
```

```ts
/**
 * Lead.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 */
export interface Lead {
  id: string;
  email: string;
}

/**
 * Slugify.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 *
 * @param input - TODO(tsdoc): describe input.
 * @returns TODO(tsdoc): describe the return value.
 */
export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Reports whether empty.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 *
 * @param value - TODO(tsdoc): describe value.
 * @returns TODO(tsdoc): describe the return value.
 */
export const isEmpty = (value: string) => value.length === 0;
```

## What to notice

- **The signature drives the tags.** Each parameter gets a `@param`, and each non-`void` function gets a `@returns`. The names come from the code, so they cannot drift from it.
- **The summary comes from the name.** `Hero` becomes "Renders the hero." because it is a React component, and `isEmpty` becomes "Reports whether empty." because a name that starts with `is` is a predicate. `slugify` becomes "Slugify.", which is correct and no help to a reader.
- **Everything is marked.** That is the important part: the summaries are guesses, and `TODO(tsdoc)` turns "review the generated comments" into a search you can finish.

```bash
grep -rn "TODO(tsdoc)" src
```

## Members

`HeroProps` has three properties and only one stub, for the interface itself. To document each property too:

```bash
npx jsdoc-to-tsdoc scaffold --members
```

```tsx
export interface HeroProps {
  /**
   * Title.
   *
   * @remarks TODO(tsdoc): verify this generated summary.
   */
  title: string;
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

`onSelect` is callable, so it gets a `@param` for `id`. Its summary reads "On select." and not a verb sentence, because `on` is not a recognised leading verb.

## Then a person takes over

A useful habit is to replace the guessed sentence with what the code cannot say:

```ts
/**
 * Turns free text into a URL-safe slug.
 *
 * @param input - Any string, including spaces and mixed case.
 * @returns The lowercase slug, with runs of whitespace replaced by a single hyphen.
 */
export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-");
}
```

## See also

The [`scaffold` page](../scaffold.md) and the tutorial [Fill in the generated stubs](../tutorials/fill-in-the-stubs.md).
