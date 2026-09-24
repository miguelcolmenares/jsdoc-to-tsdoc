---
name: docsite-adapter
description: Write or extend a docsite adapter, the code that turns a repository's own source into content.v1 collections. Use when the built-in markdown-catalog, mcp and file-scan adapters cannot express something the site needs, such as a curated tracker, a variable list or a hand-written taxonomy.
---

# docsite-adapter

An adapter reads a repository and returns collections of items. Everything downstream (the schema check, the anonymization scan, the pages) depends only on that shape, which is the `content.v1` contract.

## When to Use

- A built-in adapter covers most of the repository but not all of it (which tracker a prompt belongs to, its variables, hand-written hooks).
- The repository's source is in a format none of the built-ins reads.

Prefer configuration over code. Curated taxonomy (which group an item belongs to) goes in the adapter `options` as `groups`, not in a script, and an item that no group lists fails the build so a new item cannot land unclassified.

## Extend a built-in adapter

Point the config at a module and let it run a built-in first:

```json
{ "adapter": { "module": "./scripts/docsite-adapter.mjs" }, "options": { "collections": [] } }
```

By default the site does not install the CLI, so `import from "@silverassist/docsite"` does not resolve. An adapter that wraps a built-in, as below, needs it installed: run `npx @silverassist/docsite upgrade --mode dependency` first and tell the user, because it puts the package back in the site's devDependencies. An adapter that builds the content itself needs no import.

```js
import { markdownCatalog } from "@silverassist/docsite";

export default async function extract(context) {
  const result = await markdownCatalog(context); // reads the collections in `options`
  for (const item of result.collections[0].items) {
    item.badges = [{ label: CURATED[item.slug].tracker }];
  }
  return result;
}
```

The package exports `markdownCatalog`, `mcp` and `fileScan`, the helpers they use (`parseMarkdown`, `plainText`, `readMarkdown`, `assignGroups`, `humanize`, `displayName`, `kebab`, `firstHeading`, `firstParagraph`, `toScalar`, `matchesAny`) and the content and adapter types.

## The contract

The module receives `{ root, config, options, warn }`: the absolute repository root, the whole config, the config's `options` (unvalidated, a built-in validates its own) and a function that reports something that does not stop the build. It returns `{ meta?, collections }`.

| Type            | Fields                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Collection      | `id`, `label`, `singular`, optional `description` and `groups`, and `items`                                   |
| Item            | `slug`, `name`, `description`, optional `group`, `body` (markdown), `badges`, `meta` (scalars only), `params` |
| Badge and Group | `label` or `name`, and a `tone`: `blue`, `teal`, `amber`, `violet`, `rose` or `neutral`                       |
| `params`        | A JSON Schema object with `properties` and `required`, as far as the parameter table renders it               |

The schema is closed: a field that is not declared cannot reach a published site. `meta` at the top level (`name`, `version`, `description`, `repository`, `installCommand`, ...) is optional, since it also comes from `package.json` and the `site` block of the config.

## Rules

- **Read only what you were given.** The module receives `config.anonymize.excludePaths` and must skip those files itself when it reads any. The built-in file adapters do it for you, a module you write does not.
- **Never reach the network** and never read files outside the repository.
- **Fail loudly.** Throw on something unclassified or malformed instead of dropping it, so a bad item is a build error and not a silent gap.
- Keep it deterministic: the same repository must give the same content, so diffs of `generated.json` mean something.
- Whatever it returns is validated against `content.v1` and scanned by the deny rules like any other adapter's output.

## Verify

1. `cd site && npm run generate-content` prints the counts per collection.
2. Compare `src/content/generated.json` with what the repository really contains: names, counts, one full item.
3. `npm run build && npm run check:publish` for the full gate.
4. In the docsite-kit repository itself, `node scripts/verify-equivalence.mjs` compares the built-in adapters with the existing sites.
