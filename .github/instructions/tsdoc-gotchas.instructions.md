---
description: The catalog of ways real-world code breaks the official @microsoft/tsdoc parser, and how this tool's rules and mapCommentLines fix each one — read before touching a transformer rule or diagnosing a check/tsdoc-require-2 failure
name: TSDoc Syntax Gotchas
applyTo: "src/**/*.ts"
---

# TSDoc Syntax Gotchas — jsdoc-to-tsdoc

`tsdoc/syntax` is stricter than most JSDoc-trained instinct expects. This is
the catalog of what actually breaks it in real code, measured across three
full-repo migrations and a fourth dogfooding pass (the reference repo) — not a
guess at what might be a problem. Each entry names the rule that handles it,
under [`transformer/rules/`](../../src/transformer/rules/).

See [`.github/instructions/documentation-language.instructions.md`](./documentation-language.instructions.md)
for writing-style policy (English-only, Markdown conventions, commit
messages); this file is the technical reference for the parser's own rules.

## What breaks, and why

| Hazard | Why TSDoc rejects it | Handled by |
| --- | --- | --- |
| `{Type}` in `@param`/`@returns` | TSDoc reads `{` as the start of an inline tag; a JSDoc type annotation is never one | `remove-type-braces` |
| `{Type}` in `@throws` | Same `{` hazard, but the type is **not** redundant — it appears in no signature, so it is rewritten as a `{@link}` reference rather than stripped | `link-throws-type` (plain prose when the type could never resolve, e.g. a primitive or a union) |
| `@exception` instead of `@throws` | JSDoc synonym; TSDoc defines only `@throws` | `rename-tags` |
| `@return` instead of `@returns` | Not a recognized TSDoc tag name | `rename-tags` |
| `@template` instead of `@typeParam` | Same — JSDoc/TypeScript spelling, not TSDoc's | `rename-tags` |
| `@param [x=1]` (JSDoc optional brackets) | TSDoc has no optional-parameter syntax; the type already carries `?` | `strip-optional-param-brackets` |
| `@param` with no `- description` hyphen | The hyphen is mandatory TSDoc syntax, not a style choice | `add-hyphen-separator` |
| `@param obj.prop` (dotted path) | TSDoc has no notion of a parameter path — only a flat parameter name | `fold-dotted-param` (folds into the parent's description as a list; nothing is deleted) |
| `@access private`/`@private` etc. | Not TSDoc tags — visibility is a modifier tag (`@internal`, `@alpha`, …) | `convert-access-tags` |
| `@module`/`@fileoverview` | Not TSDoc tags; the modifier is `@packageDocumentation` | `convert-file-overview` (collapses multiple file-level tags into at most one) |
| `@function`/`@async`/`@class`/`@enum`/… | Redundant with what the TypeScript signature already declares; TSDoc has no equivalent tag at all | `remove-redundant-tags` |
| `@typedef`/`@callback`/`@type` | JSDoc-only, describe things a real `type`/`interface` already expresses | `remove-jsdoc-only-tags` |
| `@property` on an interface/type | TSDoc has no `@property` tag — a member is documented by its own comment | *(see `@property` below — not a single rule)* |
| A literal `{` or `}` in prose or an `@example` body | Read as an inline-tag delimiter wherever it appears, fenced or not — an unfenced code sample with an object literal is the single most common trigger | `fence-example-blocks` (fences the body — only when it actually needs it) |
| `<` or `>` in prose (a type parameter, a comparison, an HTML-looking fragment) | Parsed as the start of an inline HTML-like construct | `fence-example-blocks` (when inside an `@example`); otherwise left as prose the way TSDoc's own approach document expects it — see the "what stays untouched" note below |
| A bare `@` mid-word — a path alias (`@/lib/thing`), a scoped package (`@scope/pkg`), a decorator named in prose, an email address | Read as the start of a tag name | `escape-bare-at-sign` (backticks just the token; a tag name at the *start* of a line, or already inside a code span or fence, is left alone) |
| `@example` body with no fence at all | Same `{`/`<`/`>`/`@` hazards as above, just harder to spot since the body reads like plain code | `fence-example-blocks` — but **only** when the body actually contains one of those hazards. A body of plain calls and URLs is left exactly as written; imposing a fence on everything would be a style opinion, not a parse fix |

## What stays untouched, deliberately

- **Content inside a triple-backtick fence is never modified by any rule.**
  This is enforced structurally by `mapCommentLines`'s `inFence` context flag,
  not by each rule remembering to check — a rule that reached around
  `mapCommentLines` to regex the whole comment string would break this
  guarantee silently. See `architecture.instructions.md` for why rules go
  through `mapCommentLines` at all.
- **A hazard already inside an inline code span** (`` `{ retries: 3 }` ``) is
  not a hazard — TSDoc reads a code span literally, so `escape-bare-at-sign`
  and `fence-example-blocks` both leave it alone. A caption mentioning
  `@param` inside backticks stays prose, not a tag.
- **A tag name at the start of a line** (`@param`, `@returns`, …) is a real
  tag and must never be escaped — only a bare `@` appearing *mid-line*, where
  no tag could legally start, is a hazard.
- **`@property` is never simply deleted.** TSDoc has no equivalent tag, but
  its description is often the only copy of that prose. The decision — move
  the description onto the member, delete the tag as redundant, or leave it
  as a Markdown list item — needs the declaration below the comment, which no
  rule ever sees. That's why it's resolved once, per comment, in
  [`commands/convert-file.ts`](../../src/commands/convert-file.ts) rather than
  as a `transformer/rules/` entry — see `architecture.instructions.md`'s data-flow
  section.

## Diagnosing a real failure

1. **Reproduce with `check`, not by eye.** `npx jsdoc-to-tsdoc check --only "<path>"`
   parses through the same `@microsoft/tsdoc` parser `tsdoc/syntax` runs, so
   its `messageId` (`tsdoc-malformed-inline-tag`, `tsdoc-escape-right-brace`,
   `tsdoc-at-sign-without-tag-name`, `tsdoc-param-tag-with-invalid-name`, …)
   names the exact hazard class from the table above.
2. **A custom tag reported as undefined almost always means a missing or
   broken `tsdoc.json`**, not a real syntax problem — `@since` is the one tag
   this project's own `init` registers by default. Confirm the project has a
   readable `tsdoc.json` before chasing anything else.
3. **A rule that seems to have done nothing** is very likely fine: rules are
   ordered (`transformer/rules/index.ts`), and a later rule can only fire on
   what an earlier one left behind — check `PipelineResult.appliedRules` to
   see what actually ran, rather than assuming from the output alone.
</content>
