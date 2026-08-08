import { describe, expect, it } from "vitest";

import { runInteractive } from "@/prompter/run-interactive";
import type {
  FileAction,
  FileChange,
  InteractiveEffects,
} from "@/prompter/types";

function change(name: string): FileChange {
  return {
    path: `src/${name}.ts`,
    absolutePath: `/abs/src/${name}.ts`,
    proposed: `proposed ${name}`,
    diff: `diff ${name}`,
  };
}

interface Recorder {
  readonly writes: Array<{ path: string; content: string }>;
  readonly prompted: string[];
}

/**
 * Builds effects that answer each file with a scripted action, record every
 * write, and return a fixed edited body for `edit`.
 */
function effectsFor(
  script: readonly FileAction[],
  recorder: Recorder,
  editedBody = "edited body",
): InteractiveEffects {
  let call = 0;
  return {
    async prompt(view) {
      recorder.prompted.push(view.path);
      const action = script[call] ?? "skip";
      call += 1;
      return action;
    },
    async edit() {
      return editedBody;
    },
    async write(absolutePath, content) {
      recorder.writes.push({ path: absolutePath, content });
    },
  };
}

describe("runInteractive", () => {
  it("writes every accepted file's proposed content", async () => {
    const recorder: Recorder = { writes: [], prompted: [] };
    const changes = [change("a"), change("b")];

    const result = await runInteractive(
      changes,
      effectsFor(["accept", "accept"], recorder),
    );

    expect(result).toEqual({
      written: ["src/a.ts", "src/b.ts"],
      skipped: [],
      remaining: [],
      quit: false,
    });
    expect(recorder.writes).toEqual([
      { path: "/abs/src/a.ts", content: "proposed a" },
      { path: "/abs/src/b.ts", content: "proposed b" },
    ]);
  });

  it("leaves a skipped file untouched", async () => {
    const recorder: Recorder = { writes: [], prompted: [] };
    const changes = [change("a"), change("b")];

    const result = await runInteractive(
      changes,
      effectsFor(["skip", "accept"], recorder),
    );

    expect(result.written).toEqual(["src/b.ts"]);
    expect(result.skipped).toEqual(["src/a.ts"]);
    expect(recorder.writes).toEqual([
      { path: "/abs/src/b.ts", content: "proposed b" },
    ]);
  });

  it("writes what the editor returns for an edited file", async () => {
    const recorder: Recorder = { writes: [], prompted: [] };
    const changes = [change("a")];

    const result = await runInteractive(
      changes,
      effectsFor(["edit"], recorder, "hand-tuned"),
    );

    expect(result.written).toEqual(["src/a.ts"]);
    expect(recorder.writes).toEqual([
      { path: "/abs/src/a.ts", content: "hand-tuned" },
    ]);
  });

  it("stops at quit and reports the untouched remainder", async () => {
    const recorder: Recorder = { writes: [], prompted: [] };
    const changes = [change("a"), change("b"), change("c")];

    const result = await runInteractive(
      changes,
      effectsFor(["accept", "quit"], recorder),
    );

    expect(result).toEqual({
      written: ["src/a.ts"],
      skipped: [],
      remaining: ["src/b.ts", "src/c.ts"],
      quit: true,
    });
    // Only the first file was written; the prompt never reached the third.
    expect(recorder.writes).toEqual([
      { path: "/abs/src/a.ts", content: "proposed a" },
    ]);
    expect(recorder.prompted).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("returns an empty result for no changes", async () => {
    const recorder: Recorder = { writes: [], prompted: [] };

    const result = await runInteractive([], effectsFor([], recorder));

    expect(result).toEqual({
      written: [],
      skipped: [],
      remaining: [],
      quit: false,
    });
    expect(recorder.prompted).toEqual([]);
  });
});
