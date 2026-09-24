---
name: docsite-design
description: Build or change pages and components in a docsite site so they match the design system. Use when editing anything under site/src (pages, layout, components, styles) in a repository that has a docsite.config.json.
---

# docsite-design

The site's look is defined by the design system that ships with the package, and by the components copied into `site/src/components`. Follow it instead of restyling, so all the documentation sites stay consistent and an upgrade does not fight local changes.

The full specification is `design/DESIGN.md` inside the package: `node_modules/@silverassist/docsite/design/DESIGN.md` from `site/`. Read it before building a page. What follows is the short version.

## When to Use

- Adding or changing a page, a section, a card or any UI under `site/src`.
- Adding a component with `docsite add <name>`.

## Rules

1. **Content is generated.** Pages render `src/content/generated.json`. Never hand-copy content into a page, and never edit `generated.json` or `src/index.css`, both are regenerated (`index.css` from the design tokens).
2. **Dark only.** One palette, no light theme, no theme toggle.
3. **Use the components.** Registry components take their data through props and never import site content. Compose a page from `Hero`, `StatRow`, `Section`, `SectionHeading`, `PageHeader`, `CatalogCard`, `FilterBar`, `ToneBadge`, `DetailLayout`, `MetaCard`, `CodeBlock`, `Markdown` and `SchemaTable` before writing markup by hand. `npx @silverassist/docsite list` shows every component.
4. **Borders and surfaces.** `border-white/10`, `hover:border-white/20`, cards `rounded-xl border-white/10 bg-card/60`. No shadows on catalog or site components, no gradients except the hero glow, no solid gray borders.
5. **Type.** Geist for prose, JetBrains Mono (`font-mono`) for names, commands, versions and counts.
6. **Color.** Give every catalog entry a `ToneBadge` for its group and resolve tones with `createToneResolver`. Do not use an accent color as text or fill outside `ToneBadge` and the documented blue uses.
7. **Imports.** Primitives from `@/components/ui/*`, helpers from `@/lib/*`, file names in kebab-case, no arbitrary Tailwind values when a scale value exists.

## Page shapes

- **Home:** `Hero` with a `StatRow`, then `Section`s alternating default and `alt`, each opened by a numbered `SectionHeading` and holding a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` of `CatalogCard`s.
- **Index:** `Container` with `py-16`, `PageHeader`, `FilterBar`, a filtered card grid with an empty state.
- **Detail:** `DetailLayout` with a badge, a mono `h1`, a lead, a rule and then `Markdown` or `SchemaTable`, and a sticky aside of `MetaCard`s.
- **404:** centered mono `404`, a sentence, a "Back home" button.

## Adding or refreshing a component

`npx @silverassist/docsite add <name>` from the repository root copies the component and its dependencies and records their hashes in `site/.docsite.json`. It never overwrites a file you edited unless you pass `--force`, so a component you customized is kept and reported. Do not run `--force` without the user asking.

## Verify

`cd site && npm run build && npm run lint`. Then look at the page at desktop width and at 390 px, both are supported.
