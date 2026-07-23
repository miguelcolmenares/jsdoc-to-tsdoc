# jsdoc-to-tsdoc

CLI tool to migrate JSDoc comments to [TSDoc](https://tsdoc.org/) standard in TypeScript projects.

> **Status: Planning** — This repository contains the project plan and gap analysis. Implementation has not started yet.

## The Problem

Typescript projects commonly use JSDoc-style documentation comments that include type annotations (`{string}`, `{boolean}`), redundant tags (`@function`, `@typedef`, `@callback`), and non-standard tags. These are incompatible with the [TSDoc specification](https://tsdoc.org/) and cause lint errors when `eslint-plugin-tsdoc` is enabled.

There is **no existing tool** to automate this migration. See [PLAN.md](./PLAN.md) for the full gap analysis.

## Planned Features

- **Comment transformation** — Parse `/** */` comments and apply JSDoc → TSDoc conversions automatically
- **`tsdoc.json` generation** — Detect custom tags already in use and generate a valid `tsdoc.json` config
- **ESLint integration** — Optionally add `eslint-plugin-tsdoc` to the project's ESLint config
- **Interactive wizard** — Show proposed changes for review before applying
- **Dry run mode** — Preview transformations without modifying files
- **Next.js / React aware** — Understand common patterns (Server Actions, components, hooks)

## Installation (future)

```bash
npx jsdoc-to-tsdoc
```

## License

MIT
