# Contributing to jsdoc-to-tsdoc

Thanks for looking. Bug reports, a failing case from your own codebase, a clearer explanation and a fix are all welcome, and the smallest useful one is a real comment that the tool gets wrong.

## Report a problem

Open an [issue](https://github.com/miguelcolmenares/jsdoc-to-tsdoc/issues). The most useful report has three things:

1. The comment as it was before you ran anything, as text and not as a screenshot.
2. The command you ran, and its output.
3. What you expected instead.

`convert --dry-run` prints the diff without writing, so it is safe to run on the file that misbehaves and paste the result.

## Set up

You need Node 20.19 or newer.

```bash
git clone https://github.com/miguelcolmenares/jsdoc-to-tsdoc.git
cd jsdoc-to-tsdoc
npm install
npm run check   # format + typecheck + lint + test + the CLI's own `check` over this repo
```

`npm install` sets up Husky. `pre-commit` blocks direct commits to `main` and `master` and runs Prettier and ESLint over the staged files. `pre-push` runs the whole gate, `npm run check`, in about eleven seconds, so a push cannot introduce a comment the tool itself would reject. Bypass it with `git push --no-verify` only when you have a reason.

| Command | Purpose |
| ------- | ------- |
| `npm run build` | Bundle to `dist/` |
| `npm test` | Run the tests once with Vitest |
| `npm run test:watch` | Run them on change |
| `npm run check:tsdoc` | Build the CLI and run its own `check` over this repository |
| `npm run format` | Prettier, write |

## Make a change

1. Branch from `main`. Direct commits to it are blocked.
2. Write a test that fails without your change. The tests sit next to the code they cover, in `__tests__` folders.
3. Keep the tool deterministic. It does not call a language model unless a flag asks for one, and the fix for a wrong conversion is a rule, not a heuristic that guesses.
4. Run `npm run check` before you push.
5. Open a pull request. The template lists what a reviewer looks for.

The CLI documents itself with TSDoc and is gated by its own `check`, at `error`. A new export needs a comment.

For how the code is organised and why decisions were made, read [`AGENTS.md`](./AGENTS.md).

## Improve the documentation

The site is built from the `docs/` folder: one page per command, plus `docs/examples/` and `docs/tutorials/`.

- Edit the Markdown, never `site/src/content/generated.json`, which is regenerated on every build.
- Every command, output and diff on the site comes from running the CLI. When you change a behaviour, re-run the example and paste what it printed.
- Give a page a `title`, a `description` and an `order` in its frontmatter.
- Preview it:

  ```bash
  cd site
  npm install
  npm run dev
  ```

  The site's scripts run the docsite CLI through `npx` from GitHub Packages, so they need a token with `read:packages` in `NPM_GITHUB_TOKEN`. A pull request from a fork does not get one, so the `docs site builds` check is skipped there and a maintainer builds it.

## License

By contributing you agree that your contribution is licensed under the [MIT License](./LICENSE).
