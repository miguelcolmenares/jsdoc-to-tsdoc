# jsdoc-to-tsdoc — Project Plan

## Gap Analysis

### What Exists Today (July 2026)

#### Microsoft Official Ecosystem (strong)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| `@microsoft/tsdoc` | 49M | Core parser — reads and validates TSDoc comments |
| `@microsoft/tsdoc-config` | 23.8M | Loads `tsdoc.json` (custom tags like `@since`) |
| `eslint-plugin-tsdoc` | 4.3M | ESLint rule that validates syntax (`tsdoc/syntax`) |
| `@microsoft/api-extractor` | 19.5M | Full API surface review, `.d.ts` rollups, doc output |

#### Enforcement / Linting (good, growing)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| `eslint-plugin-tsdoc-require-2` | 1.3K | Enforces that exports have TSDoc + specific tags |
| `@guardian/eslint-plugin-tsdoc-required` | 1.2K | Basic export comment enforcement |

#### Documentation Generation (good)

| Package | Weekly Downloads | Role |
|---------|-----------------|------|
| TypeDoc | Standard | HTML/JSON API docs from TSDoc |
| `tsdoc-markdown` | 8.8K | Markdown generation from TSDoc |

#### VS Code Extensions (weak / dead)

| Extension | Installs | Status |
|-----------|----------|--------|
| TSDoc Comment (kingsimba) | 9.7K | Last commit 5 years ago. Converts `//` to `/** */`. |
| tsDoc (jlsilva) | 3.2K | v0.0.1, empty shell. |
| TSDoc Generator (1yoouoo) | 757 | Requires ChatGPT API key, interfaces/types only. |
| tsdoc-insert (Topppy) | 460 | Minimal, unmaintained. |
| tsdoc-gen (vicius) | 281 | Barely used. |

### The Gap: No Migration Tool

**There is no CLI tool, codemod, or VS Code extension** that automates the conversion of existing JSDoc comments to TSDoc-compliant comments.

The differences are well-defined and mechanically transformable:

| JSDoc Pattern | TSDoc Equivalent | Automation Complexity |
|---------------|-----------------|----------------------|
| `@param {string} name Description` | `@param name - Description` | Simple — regex/AST strip |
| `@returns {boolean} Description` | `@returns Description` | Simple — regex/AST strip |
| `@fileoverview Description` | `@packageDocumentation` + summary paragraph | Medium — restructure |
| `@module ModuleName` | `@packageDocumentation` | Simple — tag swap |
| `@typedef {Object} MyType` | Remove entirely | Simple — delete |
| `@callback MyCallback` | Remove entirely | Simple — delete |
| `@type {Type}` | Remove entirely | Simple — delete |
| `@property {string} name` | Inline `/** comment */` on interface member | Hard — structural |
| `@function`, `@async`, `@class` | Remove entirely | Simple — delete |
| `@enum {string}` | Remove entirely | Simple — delete |
| `@fires`, `@emits` | Not in TSDoc standard | Medium — decide policy |
| `@access private` | `@internal` or remove | Simple — tag swap |
| `@augments`/`@extends` | Remove (TS `extends` keyword) | Simple — delete |
| `@implements` | Remove (TS `implements` keyword) | Simple — delete |
| Multi-paragraph descriptions | Split into summary + `@remarks` | Medium — heuristic |
| `@todo` | Not in TSDoc standard | Define as custom tag or remove |

---

## Architecture Plan

### CLI Flow

```
$ npx jsdoc-to-tsdoc

  jsdoc-to-tsdoc v0.1.0

  Scanning project...
  ✓ Found tsconfig.json
  ✓ Found eslint.config.mjs (flat config)
  ✓ 142 TypeScript files in src/
  ✓ 87 files have JSDoc comments

  Detected custom tags in use:
    @author (34 occurrences)
    @since (12 occurrences)
    @version (3 occurrences)
    @todo (8 occurrences)

  ? How should we handle @todo? (Use arrow keys)
  ❯ Add to tsdoc.json as custom block tag
    Remove from all comments
    Skip (leave as-is, will cause lint warnings)

  Proposed changes:
  ┌─────────────────────────────────────┬──────────┐
  │ Transformation                      │ Files    │
  ├─────────────────────────────────────┼──────────┤
  │ Remove {type} from @param           │ 67       │
  │ Remove {type} from @returns         │ 45       │
  │ Remove @typedef/@callback/@type     │ 12       │
  │ Convert @fileoverview → @package... │ 8        │
  │ Remove @function/@async/@class      │ 23       │
  │ Add hyphen to @param descriptions   │ 52       │
  │ Generate tsdoc.json                 │ 1 (new)  │
  ├─────────────────────────────────────┼──────────┤
  │ Total files modified                │ 87       │
  └─────────────────────────────────────┴──────────┘

  ? Apply changes? (y/N)
```

### Core Modules

```
src/
├── cli.ts                  # Entry point, argument parsing (commander/yargs)
├── scanner/
│   ├── projectScanner.ts   # Find TS files, detect config (tsconfig, eslint)
│   └── commentExtractor.ts # Extract /** */ comments with position info
├── parser/
│   ├── jsdocParser.ts      # Parse JSDoc tags from comment text
│   └── tagRegistry.ts      # Map of known JSDoc tags → TSDoc equivalents
├── transformer/
│   ├── pipeline.ts         # Orchestrates transformation rules
│   ├── rules/
│   │   ├── removeTypeBraces.ts     # Strip {type} from @param, @returns
│   │   ├── addHyphenSeparator.ts   # @param name Description → @param name - Description
│   │   ├── convertFileOverview.ts  # @fileoverview → @packageDocumentation
│   │   ├── removeRedundantTags.ts  # @function, @async, @class, etc.
│   │   ├── removeJsDocOnlyTags.ts  # @typedef, @callback, @type
│   │   ├── convertAccessTags.ts    # @access private → @internal
│   │   └── splitRemarks.ts         # Multi-paragraph → summary + @remarks
│   └── index.ts
├── generator/
│   ├── tsdocJsonGenerator.ts  # Generate tsdoc.json from detected custom tags
│   └── eslintConfigPatcher.ts # Add eslint-plugin-tsdoc to existing config
├── reporter/
│   ├── dryRunReporter.ts   # Show proposed changes without applying
│   └── summaryReporter.ts  # Post-migration summary
└── writer/
    └── fileWriter.ts       # Apply transformations back to source files
```

### Key Design Decisions

1. **Use `@microsoft/tsdoc` parser for validation** — after transforming, parse the result with the official parser to guarantee validity.
2. **Use TypeScript Compiler API for comment extraction** — `ts.getLeadingCommentRanges()` gives precise positions without regex fragility.
3. **Rule-based pipeline** — each transformation is an independent rule that can be toggled on/off.
4. **Non-destructive by default** — dry run mode shows a diff before applying.
5. **Preserves formatting** — only modify the comment content, not surrounding code.
6. **No dependency on AI/LLM** — pure deterministic transformations.

### Technology Stack

- **Language**: TypeScript
- **CLI framework**: `commander` or `citty` (from UnJS)
- **TS Compiler API**: For AST traversal and comment extraction
- **`@microsoft/tsdoc`**: For validation of transformed comments
- **`inquirer` or `@clack/prompts`**: For interactive wizard
- **`diff`**: For showing before/after in dry run mode
- **Testing**: Vitest with snapshot tests for each transformation rule

---

## Scope Boundaries

### In Scope (v0.1.0)

- [x] Scan TypeScript project for JSDoc comments
- [x] Remove `{type}` braces from `@param` and `@returns`
- [x] Add hyphen separator to `@param` descriptions
- [x] Remove redundant JSDoc tags (`@function`, `@async`, `@class`, `@enum`)
- [x] Remove JSDoc-only tags (`@typedef`, `@callback`, `@type`)
- [x] Convert `@fileoverview`/`@module` → `@packageDocumentation`
- [x] Detect custom tags and generate `tsdoc.json`
- [x] Dry run mode with diff output
- [x] Interactive wizard for ambiguous decisions

### Out of Scope (future)

- [ ] VS Code extension wrapper
- [ ] Automatic `@remarks` splitting (heuristic, needs tuning)
- [ ] `@property` → interface member comment restructuring
- [ ] Monorepo support (multiple `tsdoc.json` files)
- [ ] ESLint config auto-patching
- [ ] CI integration (GitHub Action)
- [ ] React/Next.js specific patterns (component prop docs)

---

## Development Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project plan and gap analysis | **Done** |
| 1 | Core scanner + comment extractor | Not started |
| 2 | Parser + tag registry | Not started |
| 3 | Transformation rules (simple tags) | Not started |
| 4 | `tsdoc.json` generator | Not started |
| 5 | CLI interface + dry run reporter | Not started |
| 6 | Interactive wizard | Not started |
| 7 | Testing on real projects (nextjs-boilerplate, etc.) | Not started |
| 8 | npm publish as `jsdoc-to-tsdoc` | Not started |

---

## References

- [TSDoc specification](https://tsdoc.org/)
- [TSDoc Playground](https://tsdoc.org/play/) — test comments interactively
- [`@microsoft/tsdoc` parser](https://www.npmjs.com/package/@microsoft/tsdoc) — 49M weekly downloads
- [`eslint-plugin-tsdoc`](https://www.npmjs.com/package/eslint-plugin-tsdoc) — 4.3M weekly downloads
- [`eslint-plugin-tsdoc-require-2`](https://www.npmjs.com/package/eslint-plugin-tsdoc-require-2) — enforces comment presence
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) — for AST traversal
- [TSDoc approach document](https://tsdoc.org/pages/intro/approach/) — design goals and lax/strict modes
