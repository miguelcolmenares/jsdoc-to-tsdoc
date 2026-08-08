# Phase-9 repo fixtures — implementation plan

Issue: **#30**. Temporary; removed when the feature PR is opened.

## Problem statement

Phase 9 (fixture-based snapshot tests over real repos) is the last **Partial**
phase. Unit and integration tests pass, but nothing pins the conversion pipeline
against an **independent** target — so a rule that is _consistently wrong_ would
pass every existing test (the snapshot would be wrong the same way).

The `osa-nextjs` hand migration is the ideal ground truth (before → human answer
pairs), but **it cannot be committed**: `osa-nextjs` is a private company repo
and `jsdoc-to-tsdoc` is a **public** OSS repo. Committing its source would
publish proprietary code irreversibly.

## Decision (recorded in AGENTS.md §12)

Ship **synthetic** fixtures instead: hand-authored `input.ts` → `expected.ts`
pairs, one per conversion class, where `expected.ts` is written independently as
the _correct_ TSDoc — the analogue of the human's answer. This keeps the value
the issue asked for (an independent target catches "consistent but wrong")
without leaking proprietary code. The measured `osa` figure (41 of 81 files
byte-identical to the CLI) stays a **documented, locally-reproducible baseline**,
with the exact re-extraction command recorded, never run against a working copy.

## Design

### Fixtures (`fixtures/convert/<case>/`)

Top-level `fixtures/`, outside `src/`, so it is invisible to `tsconfig`
(`include: ["src"]`) and ESLint (`files: ["src/**/*.ts"]`). Each case is a
directory with:

- `input.ts` — pre-migration JSDoc source.
- `expected.ts` — the correct TSDoc, authored by hand as the target.

One case per conversion class: type-brace + hyphen, `@returns Promise<T>`, tag
renames, `@fileoverview`/`@module`, `@example` fencing, bare `@`, dotted
`@param`, `@property` relocation, `@access`, optional brackets, redundant-tag
removal, and an already-clean file (idempotence / the byte-identical class).

### Test (`src/__tests__/repo-fixtures.test.ts`)

Discovers the case directories and, for each:

1. `convertSourceText(input, "input.ts", { lite: false }).output === expected` —
   the pipeline reproduces the hand-authored target exactly.
2. Converting `expected` again is a no-op — the target is stable (idempotence).

Because `expected` is authored independently of what the tool currently emits, a
regression that makes a rule consistently wrong fails assertion 1 rather than
silently updating a snapshot.

### Dogfood exclusion

`check:tsdoc` scans the repo root, so it would flag the pre-migration JSDoc in
the fixtures. Add `--exclude "fixtures/**"` to that one script; `typecheck` and
`lint` already ignore the directory by scope.

### `fixtures/README.md`

Documents what the fixtures are, why they are synthetic (the public/proprietary
split), the measured `osa` baseline, and the **re-extraction command** for the
real material — run only against the pinned pre-migration commits, never a
working copy:

```bash
# osa-nextjs: before = master, human = feature/tsdoc-implementation (merge-base 46f01ff)
git -C ../osa-nextjs archive master src | tar -x -C /tmp/osa-before
node dist/cli.mjs convert --cwd /tmp/osa-before
# diff /tmp/osa-before against the human branch to reproduce the 41/81 figure
```

Pinned pre-migration commits for re-extraction: `osa` merge-base `46f01ff`,
`homecare-nextjs` `9d155e7`, `assistedliving-nextjs` `f1f10ba`,
`nextjs-boilerplate` `b803d9c`.

## Phase breakdown

1. **Fixtures + test + dogfood exclusion** — author the case pairs, the
   discovery test (match + idempotence), and the `check:tsdoc` exclude.
2. **Docs** — `fixtures/README.md` (baseline + re-extraction), `PLAN.md`
   phase 9 → **Done**, `CHANGELOG.md`, `AGENTS.md` §12 decision.

## Definition of done

- Each fixture's `convert(input)` equals its hand-authored `expected`, and each
  `expected` is idempotent.
- The dogfood gate is clean (fixtures excluded).
- Phase 9 flips to **Done**; the `osa` baseline and re-extraction command are
  recorded; the test runs in `npm test` → CI on all three Node versions.
