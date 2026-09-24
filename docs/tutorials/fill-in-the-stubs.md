---
title: Fill in the generated stubs
description: Turn the TODO markers that scaffold left into documentation people will actually read, and know when a generated summary is good enough.
order: 2
---

`scaffold` gets a project to "every export has a comment" quickly. It cannot get it to "every comment is useful", because it only sees names and types. This tutorial is about the second part, which is a person's job, and how to do it efficiently.

## Find the work

Every stub carries the same marker, so the backlog is a search:

```bash
grep -rn "TODO(tsdoc)" src
```

On the sample project from the migration tutorial that is 11 lines in two files (17 once you also run `scaffold --members`). List the files first to plan the work:

```bash
grep -rl "TODO(tsdoc)" src
```

Start with the code other people call: public functions and exported types. Internal helpers can wait.

## Judge a stub in ten seconds

For each stub, ask one question: **does this say something the name and signature do not?** Three outcomes:

| Stub | Verdict | Action |
| ---- | ------- | ------ |
| `Renders the hero.` on `Hero` | Accurate and obvious | Keep the summary, describe `props` if it matters, remove the marker |
| `Slugify.` on `slugify(input)` | Correct and empty | Rewrite: say what it produces and its edge cases |
| `Reports whether empty.` on `isEmpty(value)` | Reads a little wrong | Rewrite: what counts as empty? |

The marker exists so that "accurate and obvious" is a decision someone made, not something nobody looked at.

## Rewrite one

Before:

```ts
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
```

After:

```ts
/**
 * Turns free text into a URL-safe slug.
 *
 * @param input - Any string, including spaces and mixed case.
 * @returns The lowercase slug, with each run of whitespace replaced by a single hyphen.
 *
 * @example
 * ```typescript
 * slugify("Hello  World"); // "hello-world"
 * ```
 */
export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-");
}
```

What changed is exactly what the code cannot tell you: the purpose, the meaning of the input, what "the result" looks like, and an example. Notice the `@example` is written with a fence from the start, so `convert` has nothing to do to it.

Two habits keep the file valid:

- Use `name - description` for every `@param`, with the hyphen.
- Never put a type in braces. It is in the signature.

## Check after every file

```bash
npx jsdoc-to-tsdoc check
```

`check` does not care whether the marker is still there. It cares that the comment parses and that the export has one. So a file can be valid and still full of guesses, which is why the marker search is your progress measure, not `check`.

```bash
grep -rn "TODO(tsdoc)" src | wc -l
```

When that number is zero, you are done with the prose. The [`scaffold` page](../scaffold.md) covers the flags that shape the stubs.

## Interface members

By default `HeroProps` got one stub for the whole interface. If a props type is public, its fields are the part readers need:

```bash
npx jsdoc-to-tsdoc scaffold --members
```

Each undocumented member gets its own stub, and members you already documented are left alone. Fill them the same way:

```ts
export interface HeroProps {
  /** Headline shown above the fold. Plain text, not HTML. */
  title: string;
  /** Where the hero button navigates to. */
  href: string;
  /**
   * Called when the visitor picks a variant.
   *
   * @param id - The variant id from the CMS.
   */
  onSelect: (id: string) => void;
}
```

Run `--members` only where it pays off. A wide internal interface would gain one stub per property, most of which would say nothing.

## Do not document what is obvious

A comment that repeats the name is noise, and it is the reason people stop reading comments. It is fine to leave a short accurate summary and delete the marker:

```ts
/** Renders the hero. */
export default function Hero({ title, href }: HeroProps) {
```

## Tests

`scaffold` does not touch test files by default, so you will not find markers there. If your team does grade tests, pass `--include-tests` to `scaffold` and `check`, and turn the rules on for test paths in the ESLint config.

## What you learned

- The `TODO(tsdoc)` search is the backlog, and it is the measure of progress.
- A good stub replacement says what the signature cannot.
- `check` proves the comments are valid, and only people can prove they are useful.

## Next

When the backlog is zero, [Lock the migration in with escalate](./lock-the-migration-in.md) turns the presence rule into a build failure.
