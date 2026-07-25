---
description: Testing standards for jsdoc-to-tsdoc — Vitest, colocated __tests__, pure-unit vs temp-dir integration, and the citty command-test pattern
name: Testing Standards
applyTo: "**/*.test.ts"
---

# Testing Standards

Tests use **Vitest** (not Jest, not React Testing Library — there is no DOM here).
Mirrors `AGENTS.md` §7.

## Location & naming

Colocate tests in a `__tests__/` folder next to the code, named `<module>.test.ts`:

```
src/transformer/rules/
├── add-hyphen-separator.ts
└── __tests__/
    └── add-hyphen-separator.test.ts
```

## Structure

`describe`/`it`, importing from `vitest`. Use `@/…` aliases for the module under test.

```typescript
import { describe, expect, it } from "vitest";

import { addHyphenSeparator } from "@/transformer/rules/add-hyphen-separator";

describe("addHyphenSeparator", () => {
  it("inserts the hyphen when it is missing", () => {
    const input = "/**\n * @param name The user\n */";
    expect(addHyphenSeparator.apply(input)).toContain("@param name - The user");
  });

  it("leaves code inside fences untouched", () => {
    const input = "/**\n * @example\n * ```ts\n * foo(a: 1)\n * ```\n */";
    expect(addHyphenSeparator.apply(input)).toBe(input);
  });
});
```

## Choose the right test kind

- **Pure units** for `transformer` rules and `generator` helpers — feed input text, assert
  output. No I/O, no mocks. These domains sit at ~100% coverage.
- **Temp-dir integration** for anything touching the filesystem (`writer`, `scanner`, `init`):
  build the fixture with `mkdtemp`, clean up in `afterEach` with `rm`. **Never share mutable
  state between tests.**

```typescript
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-"));
  await writeFile(join(root, "tsdoc.json"), "{}\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
```

## Command tests (citty)

Subcommands are tested with a synthetic `CommandContext`, a stdout spy, and an exit-code
reset. Follow the established pattern in
[`src/commands/__tests__/init.test.ts`](../commands/__tests__/init.test.ts):

```typescript
import type { CommandContext } from "citty";
import { afterEach, expect, it, vi } from "vitest";

import initCommand from "@/commands/init";

const context = (args: Record<string, unknown>): CommandContext =>
  ({ args, rawArgs: [], cmd: {} }) as unknown as CommandContext;

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
    chunks.push(String(c));
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

// Commands set process.exitCode instead of throwing — reset it between tests.
afterEach(() => {
  process.exitCode = 0;
});
```

Assert on the captured output and on `process.exitCode` (`0` OK · `1` logic error ·
`2` parse failure · `3` `--check` violations), not on thrown errors.

## Mocking

Use `vi` (`vi.fn`, `vi.spyOn`, `vi.mock`) — never `jest.*`. Prefer real temp-dir fixtures
over mocking `node:fs`; reach for `vi.mock` only to isolate an external boundary.

## Coverage gate

`npm run test:coverage` enforces **≥ 80% global** (CI exit-fails below); `transformer` rules
and the `generator` domain are expected to stay near 100%. A new rule or generator branch
ships **with** its regression test.
