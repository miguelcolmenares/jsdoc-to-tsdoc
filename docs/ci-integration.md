---
title: CI integration
description: Run check and the scan gates in a pipeline, with the GitHub Action, with a pinned npx call, or with the Bitbucket pipe.
order: 10
---

`check` and `scan --fail-on-missing` / `--fail-on-stale` are meant to run as gates. They read your code, write nothing, and answer with an exit code, which is all a pipeline needs.

## Which gate

| Gate | Fails when | Use it when |
| ---- | ---------- | ----------- |
| `check` | Any comment is invalid, any export is undocumented, or legacy JSDoc remains | The migration is done and you want it to stay done |
| `check --syntax-only` | A comment does not parse | You migrated syntax but documentation coverage is a separate goal |
| `scan --fail-on-missing` | An export has no TSDoc | You care about coverage and not yet about syntax |
| `scan --fail-on-stale` | A comment contradicts its signature | Documentation accuracy matters |
| `convert --check`, `scaffold --check`, `escalate --check` | The command would change something | You want to assert one step is finished |

## With npx, pinned

```yaml
# Pin the version so a CI run is reproducible. The tool never enters
# package.json, so nothing has to be installed for this step.
- run: npx jsdoc-to-tsdoc@<version> check
```

Pin the version in the workflow, not in `package.json`. That keeps the run reproducible without putting a finished migration tool into your dependency graph.

## GitHub Action

A composite action at the repository root, listed on the GitHub Marketplace. Use the moving major tag `@v1`, which is updated on every non-breaking release, or pin an exact version for full reproducibility.

```yaml
# .github/workflows/tsdoc.yml
name: TSDoc

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: miguelcolmenares/jsdoc-to-tsdoc@v1
        with:
          command: check
          version: "1.0.0" # pin for a reproducible gate
```

The documentation-gap gate:

```yaml
      - uses: miguelcolmenares/jsdoc-to-tsdoc@v1
        with:
          command: scan
          version: "1.0.0"
          fail-on-missing: "true"
          fail-on-stale: "true"
```

| Input | Meaning |
| ----- | ------- |
| `command` | `check` or `scan`, default `check` |
| `version` | npm version to run through `npx`, default `latest` |
| `node-version` | Default `22` |
| `cwd` | Project directory |
| `fail-on-missing`, `fail-on-stale` | `scan` only |
| `syntax-only` | `check` only |
| `include-tests`, `only`, `exclude`, `report` | Same as the CLI flags |

The action's output `exit-code` carries the CLI's own exit code, for a step that wants to inspect it without failing the job.

## Bitbucket Pipe

The repository ships a buildable pipe in `pipe/`, and its variables mirror the action's inputs. **It is not published yet**: it is not on the Bitbucket marketplace or a Docker registry, because that needs registry and marketplace accounts the project does not have. Once published, usage will look like this:

```yaml
# bitbucket-pipelines.yml
pipelines:
  default:
    - step:
        name: jsdoc-to-tsdoc check
        script:
          - pipe: miguelcolmenares/jsdoc-to-tsdoc-pipe:0.1.0
            variables:
              COMMAND: "check"
              VERSION: "1.0.0"
```

The variables are `COMMAND`, `VERSION`, `CWD`, `FAIL_ON_MISSING`, `FAIL_ON_STALE`, `SYNTAX_ONLY`, `INCLUDE_TESTS`, `ONLY`, `EXCLUDE` and `REPORT`. Until then, the `npx` call above works in any pipeline that has Node.

## Exit codes in a pipeline

Both wrappers run `npx jsdoc-to-tsdoc@<version> <command> <flags>` and pass the CLI's exit code through: `0` OK, `1` logic error, `2` parse failure, `3` violations.

## See also

- [Add the TSDoc gate to CI](./tutorials/add-the-gate-to-ci.md), a walkthrough from the first local run to a strict gate.
- [`check`](./check.md) and [`scan`](./scan.md), the two commands that gate.
