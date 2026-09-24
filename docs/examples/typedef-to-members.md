---
title: From @typedef to member comments
description: How a JSDoc @typedef with @property tags becomes an interface whose members carry their own documentation, without losing any prose.
order: 3
---

JSDoc describes an object type inside a comment: a `@typedef` followed by one `@property` per field. TSDoc has neither tag, because in TypeScript the type is the interface and each field documents itself. The migration therefore has to move the prose, and this example shows that it does.

## Before

```ts
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

## After

```ts
/**
 * Homepage banner data.
 */
export interface HomepageBanner {
  /** Banner title (may contain HTML) */
  title: string | null;
  /** Banner minimum height in pixels */
  height: string | null;
}
```

`convert` reports what it relocated:

```text
converted 3 comment(s) across 3/4 file(s). 2 @property description(s) moved onto the members they document.
```

## The three outcomes

The description of a `@property` is usually the only copy of that sentence, so the tool never simply deletes it.

| Situation | Result |
| --------- | ------ |
| The member has no comment | The description moves onto the member, as above |
| The member already has a comment | The tag is deleted and the member's own wording is kept |
| There is no such member | The description stays in the comment as a list item |

The third case covers shapes with nothing to attach a comment to, such as the element type of an exported array literal. Keeping the tags as they were would survive `convert` only to fail `check` with `tsdoc-undefined-tag`, so the prose becomes a Markdown list item, which is valid TSDoc and says the same thing. This is the real result on an array of locales:

```diff
 /**
  * Supported locales.
  *
- * @property {string} code - BCP 47 language tag
- * @property {string} label - Name shown in the menu
+ * - `code` — BCP 47 language tag
+ * - `label` — Name shown in the menu
  */
 export const LOCALES = [{ code: "en", label: "English" }];
```

## See also

The [`convert` page](../convert.md), and [Parameters, returns and throws](./params-and-returns.md) for the tags around it.
