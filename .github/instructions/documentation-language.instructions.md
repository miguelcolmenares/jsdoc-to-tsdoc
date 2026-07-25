---
description: Language and documentation policy for jsdoc-to-tsdoc — English-only technical content, Markdown conventions, Conventional Commits, and TSDoc code comments
name: Documentation & Language Policy
applyTo: "**"
---

# Documentation & Language Policy — jsdoc-to-tsdoc

## Language policy

**All technical content MUST be in English:**

- TypeScript code, comments, and identifiers (variables, functions, types)
- Documentation (`.md`), `CHANGELOG.md`, `README.md`
- Commit messages, PR titles/descriptions, issue text
- GitHub Actions workflows (`.yml`) and any scripts
- CLI output, help text, and reporter strings shown to users

There is no localized/user-content exception in this repo — it is a developer CLI.
(Chat with a maintainer may be in any language; the artifacts above stay English.)

## Markdown conventions

- One `# H1` per file (the title).
- Always specify a language on every fenced code block (`typescript`, `bash`, `yaml`, `text`, …).
- `**Bold**` for key terms, `` `code` `` for identifiers, paths, flags, and commands.
- Numbered lists for sequential steps; bullet lists otherwise.
- Callouts:

```markdown
**⚠️ WARNING**: something that can bite you
**✅ TIP**: a recommended practice
**❌ AVOID**: an anti-pattern
**🔥 CRITICAL**: must-not-miss information
```

## Commit messages (Conventional Commits)

```text
type(scope): brief imperative description

Optional body explaining the why.

Closes #<issue> (when applicable)
```

Types: `feat` · `fix` · `docs` · `refactor` · `test` · `chore` · `ci`.
**No ticket prefix** (OSS project). **No AI-attribution trailers** (`Co-Authored-By: …`,
"Generated with …"). See `AGENTS.md` §6.

**Good**

```text
feat: Add remove-redundant-tags rule

Drops @type/@augments and other tags TSDoc renders redundant once the signature
is present. Registered after rename-tags so aliases normalize first.

Closes #42
```

**Avoid**: `updates`, `fixed bug`, `WEB-123: …`, anything with an AI trailer.

## Pull-request description template

```markdown
## Description
One or two sentences on what changed and why.

## Changes
- Specific change 1
- Specific change 2

## Testing
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (TSDoc dogfood included)
- [ ] `npm run test:coverage` passes (≥ 80%)
- [ ] `npm run build` passes (bundle ≤ 500 KB gzipped)

## Related issues
Closes #<issue>
```

## Code comments — TSDoc, not JSDoc

This project migrates JSDoc → TSDoc and **dogfoods** the result, so every exported symbol
carries valid TSDoc. No `{type}` braces (the type is in the signature), `@typeParam` over
`@template`, `@packageDocumentation` over `@module`. `@since` is the one custom block tag.

```typescript
/**
 * Renames non-TSDoc block tags to their TSDoc equivalents.
 *
 * @remarks
 * Runs before {@link removeRedundantTags} so aliases are normalized first.
 *
 * @param comment - The raw comment block to transform
 * @returns The comment with tags renamed
 * @since 0.1.0
 */
export const renameTags: Rule = { /* … */ };
```

Inline comments are full sentences ending with a period, and explain **why**, not what:

```typescript
// noUncheckedIndexedAccess makes tags[0] `T | undefined`; guard before use.
const first = tags[0];
```

Reserve `// TODO:` / `// FIXME:` for tracked follow-ups, with enough context to act on later.
