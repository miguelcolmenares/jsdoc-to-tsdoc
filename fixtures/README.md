# Conversion fixtures (phase-9 ground truth)

Each directory under `convert/` is a before/after pair:

- `input.ts` — pre-migration JSDoc.
- `expected.ts` — the **correct** TSDoc, authored by hand as the target.

`src/__tests__/repo-fixtures.test.ts` asserts, per case, that
`convert(input) === expected`, that `expected` is valid TSDoc, and that
`expected` is idempotent under a second conversion. Because the target is
authored independently of what the tool emits today, a rule that regresses to
being _consistently_ wrong fails the test rather than silently rewriting a
snapshot — which a self-snapshot could never catch.

## Why these are synthetic

The richest ground truth is the **`osa-nextjs`** hand migration (a real
before/human pair). It is **not** committed here: `osa-nextjs` is a private
company repository and `jsdoc-to-tsdoc` is public. Committing its source would
publish proprietary code. The fixtures reproduce the same conversion classes
with invented content instead, and the `osa` figure below is recorded as a
locally-reproducible baseline.

## The `osa` baseline

Measured with the command below, over the pinned pre-migration state:

- **80** files the human migrated.
- **64** now byte-identical to `convert`'s output (was 41 when phase 9 was
  scoped, before the fence / bare-`@` / dotted-`@param` rules landed).

This number is a regression baseline — **it should only go up**. The remaining
files differ where the human edited prose the tool cannot infer.

## Re-extraction (never run against a working copy)

An earlier attempt re-ran the CLI over an **already-converted** copy and read
`Nothing to convert — already TSDoc-clean` as success. Always extract from the
pinned commits into a throwaway directory:

```bash
# From the jsdoc-to-tsdoc repo root, with dist/ built (npm run build).
# osa: before = master, human = feature/tsdoc-implementation (merge-base 46f01ff)
BEFORE=$(mktemp -d); HUMAN=$(mktemp -d)
git -C ../osa-nextjs archive master src | tar -x -C "$BEFORE"
git -C ../osa-nextjs archive feature/tsdoc-implementation src | tar -x -C "$HUMAN"
node dist/cli.mjs convert --cwd "$BEFORE"          # note: --cwd, not positional
# then diff the human-migrated files in $BEFORE against $HUMAN and count matches
```

Other repos have pinned pre-migration commits for the same purpose:
`homecare-nextjs` `9d155e7`, `assistedliving-nextjs` `f1f10ba`,
`nextjs-boilerplate` `b803d9c`.
