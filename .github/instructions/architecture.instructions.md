---
description: Architecture guide for jsdoc-to-tsdoc — DDD domain boundaries, the barrel contract, the rule-pipeline model, and when a change belongs in a new domain vs. an existing file
name: Architecture
applyTo: "src/**"
---

# Architecture — jsdoc-to-tsdoc

## Domain = folder, never a technical layer

No `utils/`, `helpers/`, `services/`. Each folder under `src/` is a business
domain and owns exactly one public contract: its `index.ts` barrel. Everything
else in the folder is a private implementation detail, free to rename or
restructure as long as the barrel's exports stay stable.

```text
src/
├── cli.ts          # citty entry point + subcommand dispatch
├── index.ts         # programmatic library surface (re-exports every domain)
├── commands/         # one file per subcommand (citty default export) + orchestrators
├── parser/           # comment-line traversal, JSDoc→TSDoc tag registry, comment inspection
├── scanner/           # TS-compiler-API extraction, export/member inventory, file discovery
├── transformer/       # the deterministic rule pipeline + rules/
├── scaffolder/         # name→prose inference + TSDoc stub rendering
├── generator/           # init's building blocks: detection, tag classification, tsdoc.json, ESLint patch
├── escalator/            # escalate's building blocks: preflight ESLint run + severity patch
├── validator/             # check's building block: official @microsoft/tsdoc validation
├── reporter/               # colored diffs, tables, JSON/Markdown output
├── prompter/                # --interactive: pure orchestrator + @clack/prompts adapter + $EDITOR
└── writer/                   # async file writes
```

**Before adding a file, decide domain vs. file first.** A new concern that
answers "what does this comment/file/project look like" belongs in an
existing domain if one already owns that question (`parser` for comment
shape, `scanner` for source-file shape, `generator` for project shape). A new
concern that needs its own noun — a new thing the CLI reasons about, not just
a new way of looking at an existing thing — earns its own domain folder with
its own barrel. When in doubt, check whether the candidate file would import
from more than one existing domain's internals (not just its barrel) — that's
usually a sign the responsibility is actually new, not an addition to either.

## The rule-pipeline model

Every JSDoc → TSDoc transform is an independent, pure `Rule`:

```typescript
interface Rule {
  readonly name: string; // kebab-case, used in --only and reports
  readonly summary: string; // one line, shown in reports
  readonly liteSafe: boolean; // runs under --lite (@param/@returns hygiene only)
  apply(comment: string, context: RuleContext): string;
}
```

Same input always yields the same output — no time, randomness, or I/O inside
`apply`. Order matters and is fixed in
[`transformer/rules/index.ts`](../../src/transformer/rules/index.ts) —
`runPipeline` (`transformer/pipeline.ts`) applies each rule in that order,
threading the output of one into the input of the next, then trims any
trailing blank line the pass left behind
(`trimTrailingBlankContentLines`) before returning.

**A rule sees the comment and `RuleContext` — never the code the comment
documents.** Where a decision genuinely depends on that code (the one case so
far: whether a `@property` tag is safe to delete depends on whether the
member below it already has its own doc comment), the caller resolves it
first and passes the answer in via `RuleContext.removableProperties`. Its
absence must always mean "change nothing" — a rule must never infer intent
from a missing context field.

**Rules operate through `mapCommentLines`, never raw regex over the whole
comment string.** [`parser/comment-lines.ts`](../../src/parser/comment-lines.ts)
hands each rule only the *content* of one physical line (after ` * `, before
`*/`) — never the structural scaffolding, and never a line inside a
triple-backtick fence. This is the only reason `@example` code survives
verbatim through every rule that runs. A rule that reaches for `comment.replace(/regex/, …)`
directly is very likely about to rewrite text inside a fenced example or
double-touch structural whitespace.

## Data flow per command

Each subcommand composes the same handful of domains in a fixed order; the
shared "does the work, writes nothing" orchestrator lives in `commands/` next
to the citty command that calls it, so `scan` (counting) and `convert`/`scaffold`
(writing) can share exactly one code path:

- **`convert`**: `scanner.extractJsDocComments` + `scanner.collectMemberTargets`
  → per comment, decide the `@property` plan → `transformer.runPipeline` →
  `scanner.applyEdits` (one left-to-right splice) → `writer` or `reporter`.
  Orchestrator: [`commands/convert-file.ts`](../../src/commands/convert-file.ts)
  (pure, no I/O) — the only layer holding both the comment text and the AST,
  which is why the `@property` decision lives there and not inside a rule.
- **`scaffold`**: `scanner.collectExportedDeclarations` → `scanner.undocumentedDeclarations`
  → per export, `scaffolder.buildStub` → `scanner.applyEdits` → `writer`/`reporter`.
  Orchestrator: [`commands/scaffold-file.ts`](../../src/commands/scaffold-file.ts).
- **`init`**: `generator.detectProject` + `generator.collectProjectTags` →
  `generator.generateTsdocJson`/`mergeTsdocJson` + `generator.patchEslintFlatConfig`
  → `reporter`/`writer`.
- **`escalate`**: `generator.detectProject` → `escalator.updateRuleSeverity`
  (text patch) → `escalator.runPreflight` (runs the *project's own* ESLint
  with the *project's own* config) → `reporter`/`writer`. Both halves respect
  an explicit `off`: the patcher never enables it, the preflight never
  overrides it.
- **`check`**: `validator.createTsdocValidator` (loads `tsdoc.json`, configures
  the official parser) → per file, `commands/check-file.checkSourceText`
  merges the official parser's violations with `scanner.undocumentedDeclarations`
  and whether `convert` would still rewrite the file → `reporter`. Never
  writes.

## Other load-bearing decisions

- **TS Compiler API for extraction, never regex**, for anything that has to
  distinguish real syntax from a string or template literal that merely looks
  like one (`getLeadingCommentRanges`, `ts.isExportDeclaration`, …).
- **Text-based, idempotent ESLint patching, not an AST re-print** — preserves
  the author's own formatting. Idempotency is gated on a real `import`/`require`
  of the syntax plugin, never a bare substring match (a past bug: matching any
  occurrence of `"eslint-plugin-tsdoc"` also matched
  `eslint-plugin-tsdoc-require-2` and comments mentioning the plugin).
- **Fallible operations return a discriminated union**, not a throw —
  `EslintPatchResult = { ok: true; … } | { ok: false; reason; snippet }` is the
  shape to match. `throw` is reserved for genuine programmer-error invariants
  (a state the type system should have prevented).
- **`commands/*-file.ts` orchestrators are pure — no I/O.** If a change to one
  needs to read a file, hash something async, or call a dynamically-imported
  module, that need belongs in the citty command that calls it, not the
  orchestrator. This is what keeps `scan` and `convert`/`scaffold` sharing one
  code path instead of drifting into two.
