---
description: GitHub workflow for jsdoc-to-tsdoc — OSS Conventional Commits, branch/PR flow, quality gates, gh CLI, PR-review resolution, and this repo's CI / Dependabot automation
name: GitHub Workflow
applyTo: "**"
---

# GitHub Workflow — jsdoc-to-tsdoc

Open-source Node/TypeScript CLI. No Jira, no ticket prefixes, no PHP tooling.
Mirrors `AGENTS.md` §6 and §9.

## Branch management

```
main                → default / release branch
feature/<desc>      → new features
fix/<desc>          → bug fixes
```

- **Never** commit directly to `main`; open a PR.
- **Never** merge with CI red.
- One reviewable unit per commit; delete the branch after merge.

```bash
git checkout main && git pull origin main
git checkout -b feature/scaffold-command
# … work …
git commit -m "feat: Add scaffold command"
git push -u origin feature/scaffold-command
gh pr create --base main | cat
```

## Quality gates (MANDATORY before every push)

Run the same checks CI runs (`ci.yml` → matrix ubuntu/macos/windows × node 20.19/22/24):

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint . (includes the TSDoc dogfood at error over src/)
npm run test:coverage  # vitest run --coverage (≥ 80% global gate)
npm run build          # unbuild → dist/ (CI also asserts dist/cli.mjs ≤ 500 KB gzipped)
```

`npm run check` chains typecheck + lint + test.

## GitHub CLI — pipe to `cat`

Append `| cat` (or `GH_PAGER=cat`) so the pager never blocks a non-interactive shell:

```bash
gh pr view 42 | cat
gh pr checks 42 | cat
gh pr merge 42 --squash --delete-branch | cat
GH_PAGER=cat gh run list --limit 5
```

## Commits (Conventional Commits)

Types: `feat` · `fix` · `docs` · `refactor` · `test` · `chore` · `ci`.
**No ticket prefix** (OSS). **No AI-attribution trailers** (`Co-Authored-By: …`, "Generated with …").
Imperative subject; body explains the _why_.

```
feat: Add scaffold command for undocumented exports

Generates TSDoc stubs from the symbol name and signature. Off by default for
interfaces/types/consts, which false-positive on presence rules.
```

## Pull-request reviews

Automated Copilot review is wired via `.github/workflows/request-copilot-review.yml`
(re-requests on every push to an open PR). Until it lands on `main`, request Copilot
manually after pushing: `gh pr comment <n> --body "@copilot review" | cat`.

**Reviews (inline threads) vs conversation comments are different objects:**

| Type | Where | Reply / resolve |
|------|-------|-----------------|
| Review **thread** | "Files changed", inline | REST reply + **GraphQL `resolveReviewThread`** (REST cannot resolve) |
| Conversation comment | "Conversation" tab | `gh pr comment` |

When addressing a review: **fix + add a regression test**, push, then reply to each thread
referencing the fixing commit SHA and resolve it. Verify `0` unresolved before declaring done.

```bash
# Resolve a thread (only GraphQL can):
gh api graphql -f id="$THREAD_ID" -f query='
  mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread { isResolved } } }'
```

Copilot may add "low-confidence / suppressed" notes in the review body (not as threads) —
evaluate and address those too.

## Semantic versioning

| Bump | When |
|------|------|
| MAJOR (X.0.0) | Breaking CLI/flag/output change |
| MINOR (0.X.0) | New command/flag, backwards compatible |
| PATCH (0.0.X) | Bug fix, docs, internal refactor |

Pre-1.0: treat minor as the "feature" lane. Keep `CHANGELOG.md` in step with the bump.

## GitHub Actions conventions

Workflows in `.github/workflows/`:

| File | Purpose |
|------|---------|
| `ci.yml` | typecheck + lint + coverage + build + bundle-size gate on push/PR to `main` |
| `request-copilot-review.yml` | Re-request Copilot review on each PR push |
| `auto-merge-dependabot.yml` | Auto-merge Dependabot **minor/patch** once required checks pass |

- **Action pinning**: this repo pins to **major-version tags** (`actions/checkout@v4`,
  `dependabot/fetch-metadata@v2`) and lets **Dependabot** (`.github/dependabot.yml`, weekly
  `github-actions` ecosystem) bump them. Keep that convention; don't hand-pin to SHAs.
- **Dependabot auto-merge** uses the canonical pattern: `on: pull_request`, top-level
  `permissions: {}`, and a single job gated on `if: github.actor == 'dependabot[bot]'` with
  job-level `contents`/`pull-requests: write`, that runs `dependabot/fetch-metadata` and
  `gh pr merge --auto --squash` for non-major updates. Gating the **job** on the actor is
  intentional here — the auto-merge job is **not** a required status check, so its skip on
  human PRs cannot block branch protection.
- **Least privilege**: default `permissions: {}` at the workflow level; grant scopes per job.

## Post-merge

```bash
git checkout main && git pull origin main
git branch -d feature/<desc>
git fetch --prune
# Issue auto-closes if the PR body has "Closes #N"; otherwise:
gh issue close <N> --comment "Completed in PR #<pr>." | cat
```
