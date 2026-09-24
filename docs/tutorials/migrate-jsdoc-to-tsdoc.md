---
title: Migrate a JSDoc codebase to TSDoc
description: A hands-on walkthrough of the whole workflow, init, scan, convert, scaffold and check, on a small project, with the real output of every command.
order: 1
---

In this tutorial you migrate a small TypeScript project from JSDoc to TSDoc, one command at a time, and you commit after each step so you can always see what a command did. It takes about twenty minutes.

You will learn what each command changes, how to preview it first, and how to tell that the migration is finished.

## What you need

- Node 22 or newer and a package runner (`npx`, `yarn dlx` or `pnpm dlx`)
- A TypeScript project with an ESLint flat config, or the sample below
- Git, so each step is one reviewable commit

## The sample project

Skip this if you are working on your own project. Otherwise create a folder with these files. The `src/lib/api.ts` comment is the kind of JSDoc most codebases still carry.

```ts
// src/lib/api.ts
/**
 * Fetches a lead by id.
 *
 * @function fetchLead
 * @param {string} id - The lead identifier
 * @param {number} [retries=3] Number of attempts
 * @return {Promise<Lead>} The lead record
 * @throws {SyntaxError} When the response is not JSON
 */
export async function fetchLead(id: string, retries = 3): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}?retries=${retries}`);
  return res.json();
}

export interface Lead {
  id: string;
  email: string;
}

export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-");
}

export const isEmpty = (value: string) => value.length === 0;
```

```ts
// src/lib/format.ts
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
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

// Revalidate once per day. Next.js route segment config
// must be a static literal.
export const revalidate = 86400;
```

```ts
// src/lib/banner.ts
/**
 * Homepage banner data.
 *
 * @typedef {Object} HomepageBanner
 * @property {string} title - Banner title (may contain HTML)
 * @property {string} height - Banner minimum height in pixels
 */
export interface HomepageBanner {
  title: string | null;
  height: string | null;
}
```

```tsx
// src/components/hero.tsx
export interface HeroProps {
  title: string;
  href: string;
  onSelect: (id: string) => void;
}

export default function Hero({ title, href }: HeroProps) {
  return <a href={href}>{title}</a>;
}
```

Add a `package.json`, a `tsconfig.json` and an `eslint.config.mjs` that uses `tseslint.config(...)`, run `git init`, and commit.

## Step 1: measure before you change anything

Three commands, none of which write:

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
```

Three files have JSDoc that `convert` would rewrite. Now ask where the project really stands:

```bash
npx jsdoc-to-tsdoc scan --classify
```

```text
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
```

This is your map. Each line ends with the command that fixes that bucket, and you are about to run all of them. Finally, ask the gate what it thinks today:

```bash
npx jsdoc-to-tsdoc check
```

On the sample it reports `36 problem(s) across 4 file(s)`: 27 syntax errors, 6 exports without TSDoc and 3 files with legacy JSDoc. Keep that number, it is your starting point.

## Step 2: `init`, the safe one

```bash
npx jsdoc-to-tsdoc init
```

```text
Unknown tags (register or remove): @property, @function, @return, @typedef
✓ wrote tsdoc.json
✓ wrote eslint.config.mjs
Next: install dev dependencies —
  npm install -D @microsoft/tsdoc @microsoft/tsdoc-config eslint-plugin-tsdoc eslint-plugin-tsdoc-require-2
```

Read the diff with `git diff`. Only `eslint.config.mjs` and `tsdoc.json` changed, and not one comment. Then install the four packages it names. They are the lint gate and stay in your project. The CLI itself is not one of them.

The unknown tags are all JSDoc tags. Leave them, `convert` handles them next.

```bash
git add -A && git commit -m "chore: set up TSDoc lint"
```

## Step 3: `convert`, preview first

```bash
npx jsdoc-to-tsdoc convert --dry-run
```

You see a colored diff for each file and nothing is written. On `api.ts` it looks like this:

```diff
- * @function fetchLead
- * @param {string} id - The lead identifier
- * @param {number} [retries=3] Number of attempts
- * @return {Promise<Lead>} The lead record
- * @throws {SyntaxError} When the response is not JSON
+ * @param id - The lead identifier
+ * @param retries - Number of attempts
+ * @returns The lead record
+ * @throws {@link SyntaxError} When the response is not JSON
```

Look at three things in the diff, because they are the reason the tool is worth trusting:

1. The types are gone from `@param`, since the signature has them.
2. `@function` is gone, since TypeScript already knows it is a function.
3. Your sentences are untouched.

The `banner.ts` diff shows `@property` descriptions moving onto the interface members, and `format.ts` shows the `@example` getting a code fence, because its `{ ... }` would otherwise be read as a TSDoc inline tag. Apply it:

```bash
npx jsdoc-to-tsdoc convert
```

```text
converted 3 comment(s) across 3/4 file(s). 2 @property description(s) moved onto the members they document.
```

```bash
git add -A && git commit -m "docs: convert JSDoc to TSDoc"
```

Running `convert` again finds nothing to change.

## Step 4: promote the prose a person wrote

`format.ts` still has a `//` comment above `revalidate`. TSDoc cannot see it. Promote it:

```bash
npx jsdoc-to-tsdoc convert --promote-line-comments
```

```text
converted 0 comment(s) across 1/4 file(s). 1 line comment(s) promoted to /** */.
```

```diff
-// Revalidate once per day. Next.js route segment config
-// must be a static literal.
+/**
+ * Revalidate once per day. Next.js route segment config
+ * must be a static literal.
+ */
 export const revalidate = 86400;
```

The words are the author's. Do this before `scaffold`, otherwise a generated "Revalidate." stub would land between the explanation and the code. Commit it.

## Step 5: `scaffold` the rest

Run the classification again:

```bash
npx jsdoc-to-tsdoc scan --classify
```

`Valid TSDoc` is now 2 and `Line comments` is 0. The two `No docs` files are next:

```bash
npx jsdoc-to-tsdoc scaffold --dry-run
npx jsdoc-to-tsdoc scaffold
```

```text
Added 5 stub(s) across 2 file(s).
Review the generated prose: grep -rn "TODO(tsdoc): verify this generated summary." .
```

Open `src/components/hero.tsx`. The component now has a summary and its parameter documented, and each one carries a `TODO(tsdoc)` marker:

```tsx
/**
 * Renders the hero.
 *
 * @remarks TODO(tsdoc): verify this generated summary.
 *
 * @param props - TODO(tsdoc): describe props.
 * @returns TODO(tsdoc): describe the return value.
 */
export default function Hero({ title, href }: HeroProps) {
```

The summary was guessed from the name, which is why the marker exists. The next tutorial covers turning those guesses into real documentation. Commit.

`HeroProps` has three properties and one stub. If you want each property documented, run `scaffold --members` as well.

## Step 6: `check`, the finish line

```bash
npx jsdoc-to-tsdoc check
```

```text
┌─────────────────────────┬───────┐
│ Files scanned           │     4 │
│ Files with problems     │     0 │
│ TSDoc syntax errors     │     0 │
│ Exports without TSDoc   │     0 │
│ Files with legacy JSDoc │     0 │
└─────────────────────────┴───────┘
✓ TSDoc is valid and complete.
```

From 36 problems to none, in three commands that write and three that only read. `echo $?` prints `0`.

## What you learned

- `scan` and `check` are safe anywhere, because they never write.
- Every writing command has `--dry-run`, and `convert` is idempotent.
- The order matters: `convert` and `--promote-line-comments` first, so `scaffold` only fills what is truly empty.
- Stubs are guesses, and the marker makes them findable.

## Next

- [Fill in the generated stubs](./fill-in-the-stubs.md) turns the `TODO(tsdoc)` markers into documentation.
- [Lock the migration in with escalate](./lock-the-migration-in.md) makes missing documentation fail the build.
- [Add the TSDoc gate to CI](./add-the-gate-to-ci.md) runs `check` on every pull request.
