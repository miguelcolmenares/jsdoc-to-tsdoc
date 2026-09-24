---
title: Parameters, returns and throws
description: A typical JSDoc comment on an async function, converted line by line to TSDoc, with the reason for each change.
order: 1
---

The most common comment in a JavaScript-era codebase documents a function's parameters and result. It is also where most of the JSDoc habits live, so it is the best first example.

## Before

```ts
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
```

`check` reports six problems on this comment alone:

```text
4:4     syntax  The TSDoc tag "@function" is not defined in this configuration (tsdoc-undefined-tag)
5:11    syntax  The @param block should not include a JSDoc-style '{type}' (tsdoc-param-tag-with-invalid-type)
6:4     syntax  The @param block should be followed by a parameter name and then a hyphen (tsdoc-param-tag-missing-hyphen)
6:11    syntax  The @param block should not include a JSDoc-style '{type}' (tsdoc-param-tag-with-invalid-type)
6:20    syntax  The @param should not include a JSDoc-style optional name; it must not be enclosed in '[ ]' brackets. (tsdoc-param-tag-with-invalid-optional-name)
7:4     syntax  The TSDoc tag "@return" is not defined in this configuration (tsdoc-undefined-tag)
```

## Run it

```bash
npx jsdoc-to-tsdoc convert
```

## After

```ts
/**
 * Fetches a lead by id.
 *
 * @param id - The lead identifier
 * @param retries - Number of attempts
 * @returns The lead record
 * @throws {@link SyntaxError} When the response is not JSON
 */
export async function fetchLead(id: string, retries = 3): Promise<Lead> {
  const res = await fetch(`/api/leads/${id}?retries=${retries}`);
  return res.json();
}
```

## What changed, and why

| Before | After | Reason |
| ------ | ----- | ------ |
| `@function fetchLead` | removed | The declaration is already a function named `fetchLead` |
| `@param {string} id` | `@param id` | `id: string` is in the signature |
| `@param {number} [retries=3] Number of attempts` | `@param retries - Number of attempts` | The brackets and default are in the signature (`retries = 3`), and TSDoc requires the hyphen |
| `@return {Promise<Lead>}` | `@returns` | `@return` is not a TSDoc tag, and the type is in the signature |
| `@throws {SyntaxError}` | `@throws {@link SyntaxError}` | The thrown type appears nowhere else, so it becomes a link and is kept |

The prose, "The lead identifier", "Number of attempts" and "The lead record", is unchanged. The tool moves syntax and never rewrites your sentences.
