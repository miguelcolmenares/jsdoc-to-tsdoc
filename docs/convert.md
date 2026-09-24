---
title: convert
description: Rewrite existing JSDoc comments into TSDoc with deterministic, formatting-preserving transformations, and what each rule does.
order: 5
---

`convert` turns the JSDoc that is already in your code into TSDoc. It is deterministic: the same input always produces the same output, it keeps your formatting, and it never calls a language model.

```bash
npx jsdoc-to-tsdoc convert --dry-run   # colored diff, nothing is written
npx jsdoc-to-tsdoc convert             # apply it
```

A comment before and after:

```diff
 /**
  * Fetches a lead by id.
  *
- * @function fetchLead
- * @param {string} id - The lead identifier
- * @param {number} [retries=3] Number of attempts
- * @return {Promise<Lead>} The lead record
- * @throws {SyntaxError} When the response is not JSON
+ * @param id - The lead identifier
+ * @param retries - Number of attempts
+ * @returns The lead record
+ * @throws {@link SyntaxError} When the response is not JSON
  */
```

## The rules

| Rule | Example |
| ---- | ------- |
| Strip `{Type}` from `@param`, `@returns`, `@property` | `@param {string} id` → `@param id` |
| Turn a thrown type into a link | `@throws {SyntaxError}` → `@throws {@link SyntaxError}` |
| Rename tags | `@return` → `@returns`, `@template` → `@typeParam`, `@default` → `@defaultValue`, `@exception` → `@throws` |
| Remove `Promise<T>` wrappers from `@returns` | the description stays |
| Remove optional-parameter brackets | `@param [id=1]` → `@param id` |
| Insert the mandatory hyphen | `@param id The id` → `@param id - The id` |
| Convert access tags | `@private`, `@access private` → `@internal` (and `@protected`, `@public`) |
| Convert file-level tags | `@module`, `@fileoverview` → `@packageDocumentation`, once per comment |
| Delete redundant tags | `@function`, `@async`, `@class`, `@enum` and JSDoc-only `@typedef`, `@callback`, `@type` |
| Move `@property` onto members | see below |
| Fence `@example` bodies that need it | see below |
| Backtick a bare `@` mid-line | `@/lib/thing`, `@scope/pkg`, addresses |
| Fold dotted parameters | `@param opts.retries` becomes part of `opts` |

Content inside a code fence is never modified, so an `@example` that is already fenced is preserved exactly.

A thrown type is turned into a link, not stripped like a parameter type. The reason is that the thrown type appears in no signature, so removing it would delete the only place the tag says it. A type that could never resolve (a primitive, a union, a generic) becomes plain prose instead of a link that would render broken.

## `@example` bodies are fenced only when they need it

An unfenced example is the largest single source of TSDoc errors in real code, and none of them mean the documentation is wrong. A `{` in sample code is read as the start of an inline tag, and its `}` as the end of one. The same goes for `<`, `>` and an `@` anywhere, even inside a word such as an email address.

```diff
  * @example
+ * ```typescript
  * formatPrice({ amount: 12.5, currency: "USD" })
+ * ```
```

Only a body that contains one of those characters is fenced. A body of plain calls and URLs is left as written, because the aim is to fix a parse error and not to impose a house style. Measured against a hand migration of a real repository, the rule made the same decision as the human on 101 of 102 examples, and the one difference was an example fenced that did not have to be, which is the safe direction to err.

## `@property` is never thrown away

TSDoc has no `@property` tag, since a member is documented by its own comment. But the tag's description is usually the only copy of that prose, so deleting it would lose documentation. Each tag ends up in one of three places.

| Situation | What happens |
| --------- | ------------ |
| The member has no doc comment | The description moves onto the member |
| The member already has one | The tag is deleted as redundant and the member's own wording is kept |
| There is no such member | The description stays in the comment as a list item |

```diff
 /**
  * Homepage banner data.
- *
- * @typedef {Object} HomepageBanner
- * @property {string} title - Banner title (may contain HTML)
- * @property {string} height - Banner minimum height in pixels
  */
 export interface HomepageBanner {
+  /** Banner title (may contain HTML) */
   title: string | null;
+  /** Banner minimum height in pixels */
   height: string | null;
 }
```

`convert` reports how many descriptions it moved, because it is the one change that relocates text between declarations:

```text
converted 3 comment(s) across 3/4 file(s). 2 @property description(s) moved onto the members they document.
```

## `--promote-line-comments`

Some exports are documented with `//` prose that TSDoc cannot see. If you leave it, `scaffold` inserts a generated stub between that prose and the declaration, and the file ends up with a guessed summary next to the explanation a person already wrote. This flag rewrites the run of line comments as the doc comment it was serving as.

```diff
-// Revalidate once per day. Next.js route segment config
-// must be a static literal.
+/**
+ * Revalidate once per day. Next.js route segment config
+ * must be a static literal.
+ */
 export const revalidate = 86400;
```

The words are kept as written: nothing is recapitalised, repunctuated or summarised. Three kinds of run are refused:

- a run containing a tooling directive such as `// eslint-disable-next-line`, which stops working inside a block comment;
- a run containing `*/`, which would close the comment early;
- a run with no prose in it, such as a bare `//` used as spacing. The empty comment it would produce satisfies the presence rule, and `check` would stop reporting the export as undocumented without a word having been written.

It is off by default, because it is the only part of `convert` that rewrites lines that were not comments TSDoc recognised.

## Preview, review and gate

| Flag | Purpose |
| ---- | ------- |
| `--dry-run`, `--preview` | Show a colored unified diff, write nothing |
| `--check` | Exit `3` if anything would change, never write. A cheap CI question: "is the migration finished?" |
| `--interactive`, `-i` | Review each changed file: accept, skip, edit in `$EDITOR`, or quit. Needs a terminal |
| `--lite` | Only `@param` and `@returns` hygiene, leave prose and structural tags alone |
| `--promote-line-comments` | Also promote `//` prose above undocumented exports |
| `--only <globs>`, `--exclude <globs>` | Limit the files, for example `--exclude "**/*.test.ts,**/__tests__/**"` |
| `--report <fmt>` | `json` or `md` on stdout |

`convert` includes test files by default, because it rewrites JSDoc that is already there and malformed JSDoc is malformed wherever it lives. There is no flag to opt out, since `--exclude` already does that.

## Safe to run twice

A second run finds nothing to change. Together with `--dry-run`, that is what makes it reasonable to run on a large repository and review the result as a normal diff.
