import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFileText } from "@/writer/file-writer";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtt-writer-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writeFileText", () => {
  it("writes UTF-8 content that reads back verbatim", async () => {
    const path = join(root, "out.ts");
    await writeFileText(path, "export const x = 1;\n");
    expect(await readFile(path, "utf8")).toBe("export const x = 1;\n");
  });

  it("overwrites existing content", async () => {
    const path = join(root, "out.ts");
    await writeFileText(path, "first");
    await writeFileText(path, "second");
    expect(await readFile(path, "utf8")).toBe("second");
  });
});
