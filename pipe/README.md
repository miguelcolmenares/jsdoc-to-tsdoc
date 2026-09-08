# jsdoc-to-tsdoc Bitbucket Pipe

Wraps `npx jsdoc-to-tsdoc check` / `scan --classify` for Bitbucket Pipelines,
mirroring the [GitHub Action](../action.yml) at the repo root.

> **Status: source only, not published.** This directory builds and runs
> correctly (see the smoke-test job in
> [`.github/workflows/verify-ci-integrations.yml`](../.github/workflows/verify-ci-integrations.yml)),
> but it is **not yet on the Bitbucket Pipe marketplace or any Docker
> registry** — publishing needs the maintainer's own Docker Hub/registry and
> Bitbucket accounts, which this repository does not have. `image:` in
> [`pipe.yml`](./pipe.yml) is a placeholder tag that will not resolve until
> the checklist below runs.

## Usage (once published)

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
              VERSION: "0.2.1"
```

## Variables

Same shape as the GitHub Action's inputs — see [`pipe.yml`](./pipe.yml) for
the full list and defaults: `COMMAND` (`check` or `scan`), `VERSION`, `CWD`,
`FAIL_ON_MISSING`, `FAIL_ON_STALE`, `SYNTAX_ONLY`, `INCLUDE_TESTS`, `ONLY`,
`EXCLUDE`, `REPORT`.

## Building and running locally

```bash
docker build -t jsdoc-to-tsdoc-pipe:local pipe/

docker run --rm \
  -v "$(pwd)":/repo \
  -e BITBUCKET_CLONE_DIR=/repo \
  -e COMMAND=check \
  -e EXCLUDE="fixtures/**" \
  jsdoc-to-tsdoc-pipe:local
```

## Publish checklist (maintainer-only — not run by this PR)

1. Create/choose a Docker Hub (or other registry) namespace for the image,
   e.g. `miguelcolmenares/jsdoc-to-tsdoc-pipe`.
2. Build and push a versioned tag matching a `jsdoc-to-tsdoc` release:
   ```bash
   docker build -t miguelcolmenares/jsdoc-to-tsdoc-pipe:<version> pipe/
   docker push miguelcolmenares/jsdoc-to-tsdoc-pipe:<version>
   ```
3. Update `image:` in [`pipe.yml`](./pipe.yml) to the pushed tag (it is
   currently a placeholder — see the note at the top of this file).
4. Follow Atlassian's
   [pipe publishing guide](https://support.atlassian.com/bitbucket-cloud/docs/pipes-reference/)
   to list it on the Bitbucket Pipe marketplace, including the required
   `logo.png` and marketplace metadata this repository does not carry.
5. Consider a CI job (separate from this repo's GitHub Actions) that rebuilds
   and pushes the image on release, once a registry account exists to push to.

None of the above can be completed from this repository or this PR — it
needs the maintainer's own Docker Hub/registry and Atlassian Marketplace
accounts and credentials.
