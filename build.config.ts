import { fileURLToPath } from "node:url";

import { defineBuildConfig } from "unbuild";

/**
 * unbuild configuration.
 *
 * Produces two ESM entry points:
 * - `dist/cli.mjs` — the executable CLI (keeps its `#!/usr/bin/env node` shebang).
 * - `dist/index.mjs` — the programmatic library surface (barrel re-exports).
 *
 * `typescript` is listed in `externals` and is never bundled: it is a runtime
 * dependency the package runner installs alongside the CLI, not code we ship.
 * The bundle target is `< 500 KB` gzipped (asserted in CI).
 *
 * `@anthropic-ai/sdk` is also external, for a different reason: it is a
 * `devDependency`, imported only from inside `enricher/anthropic-provider.ts`
 * behind `await import(...)`, so that `--enrich=anthropic` stays possible
 * without every consumer downloading an LLM SDK they never use. Rollup can
 * usually see through a dynamic import of a listed dependency and inline it
 * anyway; excluding it here is what keeps it out of the bundle it would
 * otherwise blow the size budget with.
 */
export default defineBuildConfig({
  entries: ["src/cli", "src/index"],
  declaration: true,
  clean: true,
  rollup: {
    esbuild: {
      target: "node20",
      minify: false,
    },
    inlineDependencies: false,
  },
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  },
  externals: ["typescript", "@anthropic-ai/sdk"],
  failOnWarn: false,
});
