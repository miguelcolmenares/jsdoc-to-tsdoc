---
title: scaffold
description: Generate a TSDoc stub for every export that has no documentation, with summaries inferred from names and a TODO marker on each one.
order: 6
---

Most of a real migration is not converting old comments. It is writing the ones that never existed. `scaffold` generates a TSDoc stub for every exported declaration that has no documentation, so the project reaches "every export has a comment" in one step and a person then improves the prose.

```bash
npx jsdoc-to-tsdoc scaffold --dry-run
npx jsdoc-to-tsdoc scaffold
```

## What it touches

- **Only undocumented exports.** An export that already has a doc comment is never modified.
- **Not re-exports.** `export { x } from "./x"` is skipped because the symbol is documented where it is defined.
- **Exports found with the TypeScript compiler.** An `export` inside a string or a nested scope is never mistaken for a declaration.
- **Not test files** by default, because a stub in a file nobody grades would be a `TODO` that nothing ever asks anyone to fill. `--include-tests` changes that.

## What a stub looks like

```diff
+/**
+ * Renders the hero.
+ *
+ * @remarks TODO(tsdoc): verify this generated summary.
+ *
+ * @param props - TODO(tsdoc): describe props.
+ * @returns TODO(tsdoc): describe the return value.
+ */
 export default function Hero({ title, href }: HeroProps) {
```

The summary is inferred deterministically from the identifier, with no language model. The leading verb is conjugated (`submit` becomes "Submits"), predicates read as "Reports whether …" and acronym, kebab and snake names are split correctly. Parameters come from the signature, and `@returns` is omitted when the function returns `void`.

| Export shape | Generated stub |
| ------------ | -------------- |
| `export default function HeroSection({…}: HeroSectionProps)` | "Renders the hero section." with `@param props` and `@returns` |
| `export async function submitContactForm(prevState, formData)` | "Server Action. Submits the contact form." with one `@param` each and `@returns` |
| `export const useHash = () => …` | "React hook for the hash." with `@returns` |
| `export interface HeroSectionProps` | "Hero section props." |
| `export type LeadStatus = …` | "Lead status." |
| `export function identity<T>(value: T): T` | `@typeParam T`, `@param value`, `@returns` |
| `export function logOnly(msg: string): void` | `@param msg` and no `@returns` |

## Every stub is marked

An inferred summary is a guess, so each stub carries a `TODO(tsdoc)` marker. That makes the review a search:

```bash
grep -rn "TODO(tsdoc)" src
```

The tags follow the TSDoc order (summary, `@remarks`, `@typeParam`, `@param`, `@returns`), and the output is valid under `tsdoc/syntax` and satisfies `tsdoc-require-2/require`. Running `scaffold` twice does nothing the second time.

## `--members`

By default an interface gets one stub for its own header, however many properties it has. `--members` also stubs every undocumented member, one comment each, inferred from the member's name and declared type.

```diff
 export interface HeroProps {
+  /**
+   * Title.
+   *
+   * @remarks TODO(tsdoc): verify this generated summary.
+   */
   title: string;
   href: string;
+  /**
+   * On select.
+   *
+   * @remarks TODO(tsdoc): verify this generated summary.
+   *
+   * @param id - TODO(tsdoc): describe id.
+   */
   onSelect: (id: string) => void;
 }
```

A member whose type is callable, such as `onSelect`, gets `@param` and `@returns` like a function declaration would. A member that already has a comment is left alone, independently of whether the interface's own header is documented, because those are two separate gaps. It applies to type-literal aliases (`export type Options = { … }`) the same way.

It is off by default because it can multiply the boilerplate a run produces: a wide interface goes from one stub to one per property.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--dry-run`, `--preview` | Show the diff, write nothing |
| `--check` | Exit `3` if a run would add anything |
| `--interactive`, `-i` | Review each file before it is written |
| `--members` | Also stub interface and type-literal members |
| `--include-tests` | Also scaffold test paths |
| `--only <globs>`, `--exclude <globs>` | Limit the files |
| `--report <fmt>` | `json` or `md` on stdout |

## After the run

The summary counts what was found and what was added:

```text
┌──────────────────────┬───────┐
│ Files scanned        │     4 │
│ Exports found        │     9 │
│ Exports undocumented │     5 │
│   React components   │     1 │
│   Interfaces         │     2 │
│   Functions          │     2 │
└──────────────────────┴───────┘
Added 5 stub(s) across 2 file(s).
```

Then read the generated prose. A stub that says "Slugify." is correct and unhelpful, which is exactly what the `TODO` marker is for.

## See also

- [Stubs for undocumented exports](./examples/scaffold-stubs.md), a worked example.
- [Fill in the generated stubs](./tutorials/fill-in-the-stubs.md), for turning the `TODO(tsdoc)` markers into documentation.
- [`convert`](./convert.md), which you run first.
