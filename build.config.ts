import { fileURLToPath } from "node:url";

import { defineBuildConfig } from "unbuild";

/**
 * unbuild configuration.
 *
 * Produces two ESM entry points:
 * - `dist/cli.mjs` — the executable CLI (keeps its `#!/usr/bin/env node` shebang).
 * - `dist/index.mjs` — the programmatic library surface (barrel re-exports).
 *
 * `typescript` is a peer dependency and is never bundled — the consumer already
 * ships it. The bundle target is `< 500 KB` gzipped (asserted in CI).
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
  externals: ["typescript"],
  failOnWarn: false,
});
