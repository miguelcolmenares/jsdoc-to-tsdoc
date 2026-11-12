<!-- agents-toolkit:planning-doc issue=142 -->
# Plan: Node 24 as the minimum (#142)

## Problem

The repository still supports Node 22 (`engines.node` is `>=22.13`, the build targets `node22`), tests Node 22 in CI, and the Action installs Node 22 by default. Node 24 is the minimum for the fleet, so all of it moves to 24.

## Proposed changes

- `package.json` engines to `>=24`, `build.config.ts` target to `node24`.
- `action.yml` default `node-version` to `"24"`, and the default named in `README.md` and `docs/ci-integration.md`.
- `ci.yml` matrix to `["24", "26"]`, and the `22.13` include entry removed (24 is the floor, so the plain entry covers it).
- `pipe/Dockerfile` to `node:24-slim`, and the example image in `docs/tutorials/add-the-gate-to-ci.md` to `node:24`.
- Node 24 wording in `CONTRIBUTING.md`, `docs/tutorials/migrate-jsdoc-to-tsdoc.md`, `.github/instructions/github-workflow.instructions.md` and `AGENTS.md` (the required-contexts line).
- `CHANGELOG.md`: the existing `[Unreleased]` Node entry, no new version heading.

## Phases

1. Plan doc (this commit).
2. Runtime floor: `package.json`, `build.config.ts`, `action.yml`, `pipe/Dockerfile`.
3. CI matrix: `ci.yml`.
4. Documentation and `CHANGELOG.md`.
5. Local check under Node 24, then remove this plan doc.

## Testing strategy

- `npm ci` and the repo check (`npm run check`) under Node 24.
- Engines check of each devDependency against a Node 24 floor.
- CI matrix on the PR: `check (node 24 · ...)` and `check (node 26 · ...)` on three systems.

## Out of scope

No release, no move of the `v1` tag, no branch protection change, and no change to the `site/` project.
