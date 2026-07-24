import js from "@eslint/js";
import tsdoc from "eslint-plugin-tsdoc";
import tsdocRequire from "eslint-plugin-tsdoc-require-2";
import tseslint from "typescript-eslint";

/**
 * ESLint flat config.
 *
 * The CLI dogfoods the exact tooling it ships to consumers: `eslint-plugin-tsdoc`
 * for syntax and `eslint-plugin-tsdoc-require-2` for presence. Both syntax and
 * presence run at `error` here (stricter than the progressive `warn` default the
 * CLI scaffolds into consumer projects).
 *
 * `require-param` / `require-returns` stay `off`: the plugin (v1.x) cannot yet
 * distinguish function exports from interface / type / const exports, so enabling
 * them floods the codebase with false positives — the same trap documented in the
 * real-world migration learnings.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: {
      tsdoc,
      "tsdoc-require-2": tsdocRequire,
    },
    rules: {
      "tsdoc/syntax": "error",
      "tsdoc-require-2/require": "error",
      "tsdoc-require-2/require-param": "off",
      "tsdoc-require-2/require-returns": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
    },
  },
  {
    // Tests and barrels are exempt from the presence/syntax dogfood: test files
    // contain intentionally malformed fixtures, and barrels only re-export.
    files: ["src/**/__tests__/**/*.ts", "src/**/index.ts"],
    rules: {
      "tsdoc/syntax": "off",
      "tsdoc-require-2/require": "off",
    },
  },
  {
    files: ["*.config.ts", "*.config.mjs"],
    rules: {
      "tsdoc-require-2/require": "off",
    },
  },
);
