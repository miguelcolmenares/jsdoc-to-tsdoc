---
name: add-transformer-rule
description: Add a new JSDoc-to-TSDoc conversion rule to the transformer pipeline. Use when a new hazard class or JSDoc-only pattern needs converting (a new tag rename, a new brace/bracket stripped, a new structural rewrite) and no existing rule already covers it — check tsdoc-gotchas.instructions.md first.
---

# Add a transformer rule

Before writing a new rule, check
[`.github/instructions/tsdoc-gotchas.instructions.md`](../../instructions/tsdoc-gotchas.instructions.md)
— the hazard may already be handled by an existing rule, or belong to the
`@property` special case that is deliberately *not* a rule (see
`architecture.instructions.md`).

## 1. Write the rule

New file: `src/transformer/rules/<kebab-case-name>.ts`. A rule is a pure,
deterministic object — same input, same output, no time/randomness/I/O:

```typescript
/**
 * Rule: <one line, what it converts>.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

/**
 * <Longer description — what pattern it matches and what it becomes.>
 *
 * @example
 * ```typescript
 * <ruleName>.apply("/**\n * @oldTag value\n *\/");
 * // → "/**\n * @newTag value\n *\/"
 * ```
 */
export const <camelCaseName>: Rule = {
  name: "<kebab-case-name>",
  summary: "<one line, shown in reports and --only>",
  liteSafe: false, // true only if this is pure @param/@returns hygiene
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content; // never touch example code
      }
      // … match and transform `content` …
      return content;
    });
  },
};
```

**Always go through `mapCommentLines`** (never `comment.replace(/regex/, …)`
over the whole string) — it is what keeps `@example` bodies untouched and
structural comment scaffolding (`/**`, ` *`, `*/`) out of every rule's way.
Return `null` from the mapper to drop a line entirely (only interior lines
can be dropped); return an array of strings to expand one line into several.

If the rule's decision depends on the *declaration* the comment documents —
not just the comment text — it does not belong here at all. See
`architecture.instructions.md`'s note on `RuleContext` and the `@property`
special case in `commands/convert-file.ts`.

## 2. Register it

Add the rule to **both** places in
[`src/transformer/rules/index.ts`](../../../src/transformer/rules/index.ts):
the `export { … }` list (alphabetical) and the `RULES` array, at the position
its ordering comment says it belongs — read that comment before picking a
slot. A rule that removes a whole tag line generally goes near the end
(after tags have been renamed/normalized); a rule that escapes or fences
hazardous text generally goes first, before anything else reads the line.
Update the ordering comment itself if the new rule changes the reasoning.

## 3. Test it

Rule tests are **consolidated** in one file:
[`src/transformer/__tests__/rules.test.ts`](../../../src/transformer/__tests__/rules.test.ts)
— there is no per-rule test file. Add a `describe("<camelCaseName>", () => { … })`
block using the file's existing `comment(...lines)` and `apply(rule, text, contextOverrides?)`
helpers. Cover: the happy path, a no-op on text the rule shouldn't touch, and
— if the rule can see fenced content — that it leaves an `@example` body
alone. Every rule sits at or near 100% coverage; match that bar.

## 4. Verify

```bash
npm run check   # format + typecheck + lint + test + the CLI's own check:tsdoc
```

The last step matters more than it looks: the CLI dogfoods its own output,
so a new rule that produces even slightly malformed TSDoc in its own source
comments fails `check:tsdoc` immediately — the same safety net `convert` now
runs on every file it writes (see `newViolationCount` in `commands/convert.ts`).
