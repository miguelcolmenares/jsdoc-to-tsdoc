import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds throwaway projects that can really run ESLint, so the preflight is
 * exercised against the actual linter instead of a stand-in. Not a test file —
 * Vitest only collects `*.test.ts`.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** A documented export: the presence rule reports nothing for it. */
export const DOCUMENTED_SOURCE = [
  "/**",
  " * Adds two numbers.",
  " *",
  " * @param a - The first addend.",
  " * @param b - The second addend.",
  " * @returns Their sum.",
  " */",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "",
].join("\n");

/** An undocumented export: the presence rule reports it. */
export const UNDOCUMENTED_SOURCE = [
  "export function subtract(a: number, b: number): number {",
  "  return a - b;",
  "}",
  "",
].join("\n");

export interface EslintProjectOptions {
  /** Starting severity of the presence rule in the generated config. */
  readonly severity?: string;
  /** Extra files to write, keyed by path relative to the project root. */
  readonly files?: Readonly<Record<string, string>>;
  /** Set to `false` to leave the project without an ESLint config. */
  readonly withConfig?: boolean;
}

/**
 * Renders a flat config whose second block disables the presence rule for test
 * files — the same shape `init` writes, and the reason both the updater and the
 * preflight must respect an explicit `off`.
 */
function configSource(severity: string): string {
  return [
    'import tsdoc from "eslint-plugin-tsdoc";',
    'import tsdocRequire from "eslint-plugin-tsdoc-require-2";',
    'import tseslint from "typescript-eslint";',
    "",
    "export default [",
    "  {",
    '    files: ["src/**/*.ts"],',
    "    languageOptions: { parser: tseslint.parser },",
    '    plugins: { tsdoc, "tsdoc-require-2": tsdocRequire },',
    "    rules: {",
    `      "tsdoc-require-2/require": "${severity}",`,
    '      "tsdoc-require-2/require-param": "off",',
    '      "tsdoc-require-2/require-returns": "off",',
    "    },",
    "  },",
    "  {",
    '    files: ["**/__tests__/**"],',
    '    rules: { "tsdoc-require-2/require": "off" },',
    "  },",
    "];",
    "",
  ].join("\n");
}

/**
 * Creates a temp project wired to the repo's own ESLint install.
 *
 * The repo's `node_modules` is linked in rather than reinstalled; `fs.rm`
 * unlinks the symlink without following it, so cleaning up the temp dir cannot
 * touch the real install. A junction is used on Windows because plain directory
 * symlinks there need elevated privileges.
 */
export async function createEslintProject(
  options: EslintProjectOptions = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jtt-escalate-"));

  await symlink(
    join(repoRoot, "node_modules"),
    join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "escalate-fixture", type: "module" }, null, 2)}\n`,
  );

  if (options.withConfig !== false) {
    await writeFile(
      join(root, "eslint.config.mjs"),
      configSource(options.severity ?? "warn"),
    );
  }

  const files = options.files ?? { "src/a.ts": DOCUMENTED_SOURCE };
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }

  return root;
}
