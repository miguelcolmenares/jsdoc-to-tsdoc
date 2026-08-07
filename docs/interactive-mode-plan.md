# Interactive mode (`--interactive`) — implementation plan

Issue: **#31** (phase 7). Decision taken: **build** interactive mode (not drop
`@clack/prompts`). This document is temporary and is removed when the feature PR
is opened.

## Problem statement

`convert` and `scaffold` mutate source files. Today the only review affordance is
`--dry-run`/`--preview` (see everything, write nothing) or a full write (write
everything, review after). For a large migration a middle ground is wanted:
review each changed file and decide, one at a time. `PLAN.md` scopes this for
v0.1.0:

> `--interactive` | `convert`, `scaffold` | Prompt per file: **a**ccept ·
> **s**kip · **e**dit · **q**uit

`@clack/prompts@^1.7.0` is already a dependency, currently unused — this is what
it was added for.

## Objectives

- `convert --interactive` and `scaffold --interactive`: for each file that would
  change, print the colored unified diff and prompt `[a]ccept · [s]kip · [e]dit
  · [q]uit`.
- **accept** → write the proposed output. **skip** → leave the file untouched.
- **edit** → open the proposed output in `$EDITOR`; write back what the user
  saves (their edits win). **quit** → stop; files already accepted stay written,
  the rest are left untouched.
- End with the same summary the non-interactive run prints, over the files
  actually written.

## Current architecture

Both commands share one shape ([convert.ts](../src/commands/convert.ts),
[scaffold.ts](../src/commands/scaffold.ts)):

```
files = findSourceFiles(...)
for file of files:
  before = read(file)
  result = transform(before)          # convertSourceText / scaffoldSourceText
  if !result.changed: continue
  record(result)
  if willWrite: write(file, result.output)
  else if !report: diffs.push(formatFileDiff(...))
print report / diffs / summary
```

The per-file branch (`if willWrite … else …`) is the single integration point.

## Proposed design

### New domain: `src/prompter/`

Interactive prompting is TTY I/O and must be isolated (DDD-lite; `@clack/prompts`
is lazy-imported per the startup-time rule in `PLAN.md`). The domain exposes:

- `FileAction = "accept" | "skip" | "edit" | "quit"`.
- `promptFileAction(view): Promise<FileAction>` — the clack-backed adapter
  (`select`), where `view = { index, total, path, diff }`. Thin; prints the diff
  and the four-way choice.
- `editInEditor(path, proposed): Promise<string>` — writes `proposed` to a temp
  file, spawns `$EDITOR` (fallback chain: `$VISUAL` → `$EDITOR` → `vi`), waits,
  reads the saved content back. Isolated so it can be stubbed.
- `runInteractive(items, effects): Promise<InteractiveResult>` — the **pure
  orchestrator**. Iterates the changed files, calls the injected `prompt` and
  `edit`/`write` effects, and handles accept/skip/edit/quit. Injecting the
  effects is what makes the whole flow unit-testable without a TTY.

### Command wiring

- Add `interactive` (alias `-i`) boolean to both commands.
- **Validation** (fail fast, exit 1): `--interactive` requires a TTY
  (`process.stdout.isTTY`), and is incompatible with `--dry-run`/`--preview`,
  `--check`, and `--report` (all non-writing / non-interactive). A clear message
  names the conflict.
- When `interactive`, buffer the changed files instead of writing eagerly, then
  hand them to `runInteractive`. The counters/summary are computed from the files
  actually written (accepted or edited), so the report tells the truth.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Clack prompts need a TTY → untestable | Pure `runInteractive` with injected effects; clack adapter kept thin and covered by a light integration test |
| `$EDITOR` spawn portability (Windows) | Fallback chain; spawn through the shell the OS provides; a spawn failure surfaces as skip-with-warning, never a crash |
| Interactive + non-writing flags is nonsense | Explicit up-front validation |
| Edited content could be invalid TSDoc | Out of scope for the prompt loop — `check` remains the gate; the user owns their edit |

## Phase breakdown

1. **`prompter` domain** — types, `runInteractive` orchestrator, `editInEditor`,
   clack adapter; unit tests for the orchestrator (accept/skip/edit/quit, quit
   mid-run, edit-returns-modified) with a fake prompter.
2. **Wire `convert --interactive`** — arg, validation, buffered-then-interactive
   path; tests for the validation and the buffered flow.
3. **Wire `scaffold --interactive`** — same orchestrator; tests.
4. **Cleanup & docs** — remove the redundant `@types/diff` devDependency
   (`diff@9` ships its own types); record the build-vs-drop decision in
   `AGENTS.md` §12; flip `PLAN.md` phase 7 → shipped and check the `[ ]` boxes
   (lines 1014, 1029, 1035); `CHANGELOG.md`; `README.md`. `npm run check` clean.

## Definition of done

- `convert --interactive` / `scaffold --interactive` work end to end on a TTY.
- Validation rejects the incompatible flag combinations with a clear message.
- `runInteractive` is covered without a real TTY.
- `@types/diff` removed; `npm run check` clean; decision recorded in `AGENTS.md`.
