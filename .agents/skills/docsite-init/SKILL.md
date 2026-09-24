---
name: docsite-init
description: Add a documentation microsite to a repository with @silverassist/docsite. Use when a repository has no docsite.config.json or site/ folder yet, or when the first setup (init, config, first build) needs fixing.
---

# docsite-init

Adds a documentation site to the current repository: `docsite.config.json` at the root, a Vite and React site in `site/`, and a first extraction of the repository's own content. The site never holds hand-copied content, it renders `src/content/generated.json`, which `docsite extract` rebuilds from source on every dev start and build.

## When to Use

- The repository has no `docsite.config.json` and no `site/` folder.
- `init` was run but the config does not match what the repository documents.
- The first `npm run build` in `site/` fails.

Not for a repository that already has a site: change its config, use `docsite add <component>` for components, or `docsite-adapter` for content that files cannot express.

## Prerequisites

- Node 22 or newer.
- `NPM_GITHUB_TOKEN` exported with `read:packages`. `@silverassist/*` packages come from GitHub Packages, so confirm with `npm view @silverassist/docsite version`. If it fails, stop and tell the user what is missing. Never ask for, print or store the token.
- Something to document: a `docs/` folder with markdown, or a README.

## Steps

1. **Preview** — From the repository root run `npx @silverassist/docsite@latest init --dry-run` and read what it would write. When `package.json` and the git remote do not give a name, description or repository, pass `--name`, `--description` and `--repository`. `--version` and `--install-command` override the same way.
2. **Scaffold** — Run `npx @silverassist/docsite@latest init`. It writes `docsite.config.json` (kept if it already exists), copies the template into `site/` (`--dir` changes the folder), installs every registry component, writes the launcher `scripts/docsite.mjs` and pins the running CLI release in `site/.docsite.json`, and runs the first extraction. The CLI is not added to the site's dependencies, the scripts run it through `npx` at the pinned release (`--dependency` installs it instead).
3. **Choose the adapter.** `init` always writes `markdown-catalog`: over `docs/`, or over the README and the CHANGELOG when there is no `docs/`. It also adds a "Tutorials" collection for `docs/tutorials/` and an "Examples" collection for `docs/examples/` or `examples/` when they exist. It does not detect the repository's kind, so edit the config when that is wrong:

   | The repository documents                               | Adapter                                         | Options                                                                                                                              |
   | ------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
   | Markdown files or folders, optionally with frontmatter | `markdown-catalog`                              | `collections`, each with `id`, `label`, `singular` and a `source` (`dir` plus `layout: "files"` or `"folders"`, or explicit `files`) |
   | An MCP server                                          | `mcp`                                           | `command`, `args`, optional `cwd` and `env`                                                                                          |
   | A folder of source files with a regular shape          | `file-scan`                                     | `dir`, `glob`, a named-group `pattern`, `fields`                                                                                     |
   | Something no built-in reads                            | `{ "module": "./scripts/docsite-adapter.mjs" }` | see the `docsite-adapter` skill                                                                                                      |

   Every option has a schema. Add `"$schema": "./site/node_modules/@silverassist/docsite/schema/config.v1.schema.json"` to the config for editor validation. When `groups` is set, an item that no group lists fails the build unless `unmappedGroup` is set.

4. **Give the menu its entries.** Every collection is a menu entry with an index and detail pages, so a repository with tutorials and examples should show them next to the docs. Check what `init` found, and add a collection for any other folder of markdown worth publishing. Never write content that the repository does not have: no source folder, no entry. In a tutorial series, put `order: 1`, `order: 2` in each file's frontmatter so they sort as a sequence. Item names and descriptions come from the frontmatter, else from the first heading and paragraph, so give an important page a `description` when its opening paragraph would not read well on a card.
5. **Decide what must not be published** with the `docsite-anonymize-review` skill before the first build is trusted: `anonymize.excludePaths` and `anonymize.replace`.
6. **Install and build** — `cd site && npm install && npm run build`. Extraction refuses to write `generated.json` when a deny rule matches. Fix the source or add a replacement, never edit `generated.json`.
7. **Check** — `npm run check:publish` in `site/`. On a private repository it fails until someone decides whether the site may be public, see `docsite-publish`. That decision is the user's.
8. **Commit** `docsite.config.json` and `site/`. `site/src/content/generated.json` is gitignored.

## Common failures

| Symptom                                          | Cause                                | Fix                                                                         |
| ------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| `already contains a site`                        | `site/package.json` exists           | Use `docsite add`, or `--force` to overwrite                                |
| `no group for "x"`                               | An item is missing from the taxonomy | Add it to a group, or set `unmappedGroup`                                   |
| The first extraction failed, no `generated.json` | Config error or deny-rule match      | Read the message, fix the config, run `npm run generate-content` in `site/` |
| `E401` or `404` on install                       | Registry auth                        | `NPM_GITHUB_TOKEN` is missing or lacks `read:packages`, tell the user       |
