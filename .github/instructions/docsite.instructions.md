---
applyTo: "site/**"
---

# Docsite site rules

`site/` is a documentation site built with `@silverassist/docsite`. These rules always apply when working in it. The skills `docsite-design`, `docsite-adapter`, `docsite-anonymize-review` and `docsite-publish` have the detail.

## Never

- Edit `src/content/generated.json` or `src/index.css`. Both are generated, the first by `docsite extract` on every dev start and build, the second from the design tokens.
- Hand-copy content into a page. Pages render the generated content, change the source or the adapter instead.
- Add a light theme or a theme toggle. The site is dark only.
- Set `acknowledgePublicPages`, or change a deploy target, without the user's explicit decision.
- Silence a publish-check finding by weakening a rule or adding it to `allow`. Fix the source, or exclude or replace it in `docsite.config.json`.
- Print, log or commit `NPM_GITHUB_TOKEN`.

## Always

- Compose pages from the components in `@/components/*` before writing markup. `npx @silverassist/docsite list` shows them.
- Border `border-white/10`, hover `hover:border-white/20`, no shadows on site components, names and numbers in `font-mono`.
- Import with `@/` and name files in kebab-case.
- Run `npm run build` and `npm run check:publish` in `site/` after a change to content, config or pages, and report a skipped check as skipped.
