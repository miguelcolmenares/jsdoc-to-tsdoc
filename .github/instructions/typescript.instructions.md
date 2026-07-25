---
description: TypeScript code style for the jsdoc-to-tsdoc CLI — ESM, strict types, named exports, discriminated-union error handling, and TSDoc (not JSDoc) dogfooding
name: TypeScript Standards
applyTo: "**/*.ts"
---

# TypeScript Standards

`jsdoc-to-tsdoc` is an **ESM-only TypeScript CLI/codemod** (no React, no browser).
These rules mirror `AGENTS.md` §4 and §6 — when in doubt, the code and `AGENTS.md` win.

## Exports

**Named exports only** from library modules. A `default export` is **reserved for
`citty` command definitions** (`src/commands/*.ts`). There are no React components here.

```typescript
// ✅ library module — named exports (src/transformer/rules/add-hyphen-separator.ts)
export const addHyphenSeparator: Rule = { /* … */ };

// ✅ citty command — the one place a default export is allowed (src/commands/init.ts)
export default defineCommand({ /* … */ });

// ❌ default export from a library module
export default function convertFile() {}
```

## No `any`, no non-null `!`

`tsconfig` is `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
Prove existence or handle `undefined` — never paper over it.

```typescript
// ❌ any + non-null assertion
function firstTag(tags: any) { return tags[0]!.name; }

// ✅ explicit type + guarded access (noUncheckedIndexedAccess makes [0] `T | undefined`)
function firstTag(tags: readonly Tag[]): string | undefined {
  const first = tags[0];
  return first?.name;
}
```

Use `readonly` on shared/immutable data. Reserve `throw` for programmer-error invariants
(see the discriminated-union rule below).

## Fallible operations return discriminated unions, not throws

Expected failure is data, not an exception. This is a core pattern in `generator/`.

```typescript
// ✅ discriminated union — caller must handle both arms
type EslintPatchResult =
  | { ok: true; content: string }
  | { ok: false; reason: string; snippet: string };

// ❌ throwing for an expected/recoverable outcome
function patch(config: string): string {
  if (unknownShape) throw new Error("cannot patch"); // ❌
}
```

## Imports

Absolute `@/…` aliases (never `../../`), grouped **node-builtins → external → internal →
type-only**, alphabetized within each group, `import type` for type-only imports.

```typescript
import { readFile } from "node:fs/promises";

import { defineCommand } from "citty";

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer";
```

## Naming & files

- **Files/folders**: `kebab-case` (`remove-type-braces.ts`). The filename mirrors its
  primary export (`add-hyphen-separator.ts` → `addHyphenSeparator`).
- **Types/interfaces**: `PascalCase`, **no `I` prefix**. **Functions/consts**: `camelCase`.
  `UPPER_SNAKE_CASE` only for module-level frozen config.
- **DDD-lite**: folder = domain, never a tech layer. No `utils/`, `helpers/`, `services/`.
  Each domain's `index.ts` barrel is its only public contract.

## Clarity, ternaries, destructuring

- **Never nest ternaries** — use `if`/early returns.
- Prefer explicit, readable steps over dense one-liners.
- Destructure function parameters and objects at the top.

```typescript
// ❌ nested ternary
const sev = strict ? "error" : warnOnly ? "warn" : "off";

// ✅ early returns
function severity(strict: boolean, warnOnly: boolean): Severity {
  if (strict) return "error";
  if (warnOnly) return "warn";
  return "off";
}
```

## Document with TSDoc, never JSDoc

This tool **migrates JSDoc → TSDoc and dogfoods the result**: `tsdoc/syntax` and
`tsdoc-require-2/require` run at **`error`** over `src/` (barrels and `__tests__/` are
exempt). Every exported symbol needs valid TSDoc.

```typescript
/**
 * Ensures `@param`/`@typeParam` use the TSDoc `name - description` form.
 *
 * @remarks
 * Handles both a missing separator and the JSDoc `name: description` colon style.
 *
 * @param comment - The raw comment block to transform
 * @returns The comment with hyphen separators inserted
 * @since 0.1.0
 *
 * @example
 * ```typescript
 * addHyphenSeparator.apply("/** @param name The user *\/");
 * // → "/** @param name - The user *\/"
 * ```
 */
```

**TSDoc, not JSDoc** — no `{type}` braces in `@param`/`@returns` (the type is in the
signature), `@typeParam` not `@template`, `@packageDocumentation` not `@module`. `@since` is
the project's one custom block tag (declared in `tsdoc.json`). `@param`/`@returns` presence is
**not** required on interfaces/types/consts.

## Runtime & bundle constraints

- **ESM only**; `typescript` is a **peer dependency** — never bundle the compiler.
- Lazy-import heavy dependencies; the built `dist/cli.mjs` is CI-gated at **< 500 KB gzipped**.
- **SRP**: one module = one responsibility. A file over ~150 lines is a smell (command
  orchestrators are the pragmatic exception).
