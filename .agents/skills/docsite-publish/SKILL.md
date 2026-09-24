---
name: docsite-publish
description: Publish a docsite site, decide its visibility and set up the deploy. Covers the visibility gate for private repositories, the GitHub Pages workflow, the SPA fallback and base path, and the publish check in CI. Use when a site is ready to go live, when docsite check fails on visibility, or when the deploy workflow needs to be created or fixed.
---

# docsite-publish

A site goes live through a deploy workflow that builds it, runs the publish check and uploads it. The gates are configured in `docsite.config.json`, and one of them needs a decision that belongs to the user.

## When to Use

- The site is ready and needs a deploy.
- `docsite check` fails with "The repository is private but GitHub Pages sites are public".
- The deploy workflow is missing, or the deployed site shows blank pages or broken links.

## The visibility gate

GitHub Pages from a private repository is public unless the organization restricts Pages access. `docsite check` asks GitHub (`gh repo view`) whether the repository is private, falls back to `repositoryVisibility` in the config, and fails when it cannot tell.

| Deploying to `github-pages` (the default) with                        | `check` result                      |
| --------------------------------------------------------------------- | ----------------------------------- |
| a public repository and `"visibility": "public"`                      | passes                              |
| a private repository, or `"visibility": "internal"`, not acknowledged | fails: the site would be public     |
| the same, with `"acknowledgePublicPages": true`                       | passes, with a warning on every run |
| `"deploy": { "target": "internal" }` or `"none"`                      | the Pages rule does not apply       |

**Stop and ask the user** whether the content may be public. Do not decide it, and never set `acknowledgePublicPages` yourself. On an explicit yes, set it and record the decision in the pull request that adds the site, so the warning that keeps appearing has an explanation next to it. If the answer is no, use another deploy target or restrict Pages access if the organization's plan supports it (the gate cannot see access control, so the flag is still needed, with the reason written down).

## The workflow

There is no generated workflow yet. Create `.github/workflows/deploy-site.yml` modelled on an existing site: trigger on pushes to the default branch that touch `site/**` and the documented sources, and on `workflow_dispatch`.

```yaml
env:
  NPM_GITHUB_TOKEN: ${{ secrets.NPM_GITHUB_TOKEN }}

permissions:
  contents: read
  packages: read
  pages: write
  id-token: write

steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with:
      node-version: "22.x"
      cache: "npm"
      cache-dependency-path: site/package-lock.json
  - name: Install site dependencies
    working-directory: site
    run: npm ci
  - name: Build site
    working-directory: site
    env:
      VITE_BASE_PATH: /${{ github.event.repository.name }}/
    run: npm run build
  - name: Publish check
    working-directory: site
    env:
      GH_TOKEN: ${{ github.token }}
    run: npm run check:publish
  - name: Add SPA fallback and disable Jekyll
    working-directory: site/dist
    run: |
      cp index.html 404.html
      touch .nojekyll
  - uses: actions/upload-pages-artifact@v5
    with:
      path: site/dist
```

then a `deploy` job with `environment: github-pages` and `actions/deploy-pages@v5`. Check the current versions of these actions in a sibling repository before copying.

Points that break deploys:

- `NPM_GITHUB_TOKEN` must be in the environment of every step, so set it on the job. The site scripts run the CLI through `npx`, which comes from GitHub Packages, and npm refuses to run at all when `site/.npmrc` reads a variable that is undefined. The repository needs that secret. Ask the user to set it, never ask for its value.
- `VITE_BASE_PATH` must be `/<repository-name>/` for a project site, or assets 404.
- `404.html` is a copy of `index.html`, which is what makes deep links work on a single-page app.
- `check:publish` runs after the build because it scans `dist`. `GH_TOKEN` lets `gh repo view` answer, otherwise set `repositoryVisibility` in the config.
- The repository's Pages setting must use "GitHub Actions" as the source.

## Other targets

The kit only knows GitHub Pages. For a Bitbucket repository there is no decided target (object storage plus a CDN behind Bitbucket Pipelines is the candidate). Do not invent one: ask the user, and set `"deploy": { "target": "internal" }` or `"none"` in the meantime so the Pages rule does not apply.

## After deploying

Open the published URL and check the home page, one detail page, a deep link opened in a fresh tab (this proves the fallback) and the search. Report what you verified.
