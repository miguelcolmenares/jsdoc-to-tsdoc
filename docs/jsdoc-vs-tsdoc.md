---
title: JSDoc vs TSDoc
description: The concepts behind the migration, every difference between the two comment styles, and why each one exists.
order: 2
---

JSDoc and TSDoc look alike, which is why the differences are easy to miss. Both are `/** ... */` comments with `@tags`. The difference is who reads them and what they are allowed to say.

## Why the two exist

**JSDoc** was designed for JavaScript. A JavaScript function carries no type information, so the comment is where the types live: `@param {string} id`.

**TSDoc** is a specification for TypeScript. TypeScript already knows the types, so a TSDoc comment only holds what the signature cannot say: what the function is for, what each parameter means, what it returns, when it throws. TSDoc also defines a strict grammar, so any tool can parse a comment the same way. Microsoft ships that parser as `@microsoft/tsdoc`, and `eslint-plugin-tsdoc` is built on it.

Strictness is the point. A comment that a strict parser accepts is a comment every TSDoc-aware tool can read. A comment full of JSDoc habits fails that parser, and the failure shows up as lint errors on code that is otherwise fine.

## Every difference the tool handles

| JSDoc habit | TSDoc | Why |
| ----------- | ----- | --- |
| `@param {string} id` | `@param id` | The type is in the signature, repeating it lets the two drift apart |
| `@param id The id` | `@param id - The id` | TSDoc requires a hyphen between the name and the description |
| `@param [id=1]` | `@param id` | Optionality and defaults are in the signature, not the comment |
| `@param opts.retries` | folded into the description of `opts` | TSDoc has no dotted parameter names |
| `@return {T}` | `@returns` | `@return` is not a TSDoc tag, and the `{T}` goes away like any type |
| `@template T` | `@typeParam T` | TSDoc's name for a generic parameter |
| `@default 3` | `@defaultValue 3` | Same tag, TSDoc spelling |
| `@exception` | `@throws` | One tag for "this can throw" |
| `@throws {SyntaxError}` | `@throws {@link SyntaxError}` | The thrown type appears in no signature, so it becomes a link and is not dropped |
| `@private`, `@access private` | `@internal` | TSDoc's marker for "not part of the public API" |
| `@module`, `@fileoverview` | `@packageDocumentation` | The file-level comment |
| `@function`, `@async`, `@class`, `@enum` | removed | TypeScript already knows what the declaration is |
| `@typedef`, `@callback`, `@type` | removed | These describe types, and TypeScript has real ones |
| `@property title - ...` | a comment on the `title` member | TSDoc documents a member on the member |
| a bare `@example` body | the body in a code fence | `{`, `<`, `>` and `@` in sample code are read as TSDoc syntax |
| `@/lib/thing` in prose | `` `@/lib/thing` `` | A bare `@` in a sentence starts a tag |

Each row has a page of its own in Examples, with the before and after taken from a real run.

## What the tool does not change

- **Your prose.** Summaries, descriptions and remarks are kept word for word. The tool is deterministic and does not call a language model unless you ask for suggestions with `scan --enrich`.
- **Code.** Only comments are edited.
- **Content inside code fences.** An `@example` that already has a fence is never touched.
- **Documentation that contradicts the signature.** A comment that names a parameter which does not exist is reported as stale and left for a person to fix. Guessing which side is right would be worse than reporting it.

## The three ways a comment can be wrong

The `check` command sorts problems into three categories, and it helps to keep them apart because each has a different fix.

| Category | What is wrong | Fixed by |
| -------- | ------------- | -------- |
| `syntax` | The TSDoc parser rejects the comment | `convert`, or a manual edit |
| `legacy` | The comment is still JSDoc that `convert` knows how to rewrite | `convert` |
| `missing` | An export has no comment | `scaffold`, then a person |

## Vocabulary

- **Export**: a declaration other modules can import. TSDoc requirements apply to exports.
- **Stub**: a generated comment with a guessed summary. Every stub carries a `TODO(tsdoc)` marker so a human reviews it.
- **Progressive severity**: the "missing documentation" rule starts as a warning and is raised to an error at the end of the migration with `escalate`.
- **Topology**: how a file is documented today, from "Valid TSDoc" to "Stale docs". `scan --classify` reports it.
