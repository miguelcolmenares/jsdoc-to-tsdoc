# Copilot repository instructions — jsdoc-to-tsdoc

These instructions apply to every Copilot request in this repository. They are a
concise summary; the full engineering context lives in
[`AGENTS.md`](../AGENTS.md) and the roadmap in [`PLAN.md`](../PLAN.md). Read
`AGENTS.md` before non-trivial work instead of re-scanning the tree.

## What this project is

A zero-config CLI (`npx jsdoc-to-tsdoc <command>`) that migrates a TypeScript
project's doc comments from **JSDoc** to the **TSDoc** standard and bootstraps
the ESLint tooling that keeps them valid. Workflow: `init → convert → scaffold →
escalate`. Shipped today: `init`, `scan`, `convert`. Pure Node CLI, ESM only,
`typescript` is a peer dependency.

## Architecture

- **DDD-lite: folder = domain, never tech layer** (`parser`, `scanner`,
  `transformer`, `generator`, `reporter`, `writer`, `commands`). No `utils/` /
  `helpers/` / `services/`. Each domain exposes exactly one barrel `index.ts`;
  import through the barrel (`@/transformer`), never from internal files.
- **Transforms are pure, deterministic `Rule`s** composed in a fixed-order
  pipeline. Same input → same output; no time, randomness, or I/O.
- **Never rewrite comments with raw regex over the whole string.** Go through
  `parser`'s `mapCommentLines` (fence-aware, format-preserving) so structural
  scaffolding and fenced `@example` code are never corrupted.
- **Fallible operations return discriminated unions** (`{ ok: true … } | { ok:
  false … }`), not throws. `throw` is only for programmer-error invariants.

## Coding conventions

- Files/folders `kebab-case`; the filename mirrors its primary export
  (`add-hyphen-separator.ts` → `addHyphenSeparator`).
- Exports: `PascalCase` types (no `I` prefix), `camelCase` funcs/consts. Named
  exports only from library modules; default export is reserved for citty commands.
- Imports: absolute `@/…`, grouped (node → external → internal → type-only),
  alphabetized, `import type` for types.
- TypeScript is `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
  **No `any`. No non-null `!`.** Use `readonly` on shared data.
- **TSDoc-strict**: every exported symbol needs valid TSDoc. `tsdoc/syntax` and
  `tsdoc-require-2/require` run at `error` over `src/`. Keep `require-param` /
  `require-returns` **off** (false positives on interfaces/types/consts).
- One module = one responsibility; a file over ~150 lines is a smell.

## Tests

- Vitest, colocated in `__tests__/` as `<module>.test.ts`. Coverage gate ≥ 80%
  (transformer rules and generator ~100%).
- Pure units for rules/generators; temp-dir (`mkdtemp`) integration for anything
  touching the filesystem, cleaned up in `afterEach`. No shared mutable state.
- Command tests use the `runHandler(cmd, args)` + `captureStdout` pattern (see
  `src/commands/__tests__/init.test.ts`).
- Add a regression test with every bug fix.

## Before you push

Run and keep green: `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build` (CI also asserts the `dist/cli.mjs` gzipped bundle is < 500 KB).

## Commits & PRs

- Conventional Commits (`feat`/`fix`/`docs`/`refactor`/`test`/`chore`/`ci`),
  **no ticket prefix**, **no AI-attribution trailers**. Branch `feature/<desc>`
  or `fix/<desc>`. One reviewable unit per commit.
- When addressing review comments: fix + regression test, push, reply to each
  thread with the fixing commit, and resolve the thread. Verify 0 unresolved.

---

## Agent customization

Repository-scoped agent guidance, as path-specific
`.github/instructions/*.instructions.md` files (`applyTo` frontmatter globs)
rather than growing this single file, plus reusable skills for the recurring
tasks.

- [x] **Architecture** — [`architecture.instructions.md`](./instructions/architecture.instructions.md)
      (`applyTo: "src/**"`): DDD domains, barrel contract, the rule-pipeline
      model, discriminated-union error handling, when to add a domain vs a file.
- [x] **TSDoc gotcha catalog** — [`tsdoc-gotchas.instructions.md`](./instructions/tsdoc-gotchas.instructions.md)
      (`applyTo: "src/**/*.ts"`): `mapCommentLines` usage and every `tsdoc/syntax`
      breaker this project has actually hit, with the rule that handles each.
      General writing/commit-message policy already lived in
      [`documentation-language.instructions.md`](./instructions/documentation-language.instructions.md) —
      this file is the deeper technical reference the two together replace.
- [x] **Testing** — already covered by [`tests.instructions.md`](./instructions/tests.instructions.md)
      (`applyTo: "**/*.test.ts"`): Vitest patterns, temp-dir fixtures, the
      command test harness.
- [x] **Reviews** — already covered by [`github-workflow.instructions.md`](./instructions/github-workflow.instructions.md)'s
      "Pull-request reviews" section: triaging comments, reply + resolve
      threads, thread vs. conversation-comment distinction. No separate file
      needed — the content already existed under a broader-scoped one.
- [x] **`add-transformer-rule` skill** — [`.github/skills/add-transformer-rule/`](./skills/add-transformer-rule/SKILL.md):
      write, register, and test a new conversion rule.
- [ ] **Remaining skills**: a `scaffold-template` skill (add a new export-kind
      stub to `scaffolder/`) and an `add-subcommand` skill (wire a new citty
      command through `commands/`). Follow `add-transformer-rule`'s structure
      once a real need for either comes up — write, register, test, verify.

References: VS Code
[custom instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions)
and [agent skills](https://code.visualstudio.com/docs/agent-customization/agent-skills);
GitHub
[repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).
