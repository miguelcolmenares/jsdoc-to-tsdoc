---
title: init
description: Bootstrap a project for TSDoc, generating tsdoc.json and patching the ESLint flat config without touching source comments.
order: 3
---

`init` prepares a project for TSDoc and stops there. It does not read or rewrite a single documentation comment, so it is the safest first step and it is idempotent: running it twice changes nothing the second time.

```bash
npx jsdoc-to-tsdoc init
```

## What it does

1. **Registers your custom tags in `tsdoc.json`.** It scans the codebase for block tags and registers the recognised ones (`@since`, `@author`, `@version`) in a generated or merged `tsdoc.json`. Tags it does not recognise are reported so you can decide, and hyphenated tokens are ignored: a TSDoc tag name cannot contain a hyphen, so `@jest-environment` and `@ts-check` belong to other tools sharing the comment.
2. **Patches the ESLint flat config.** It adds the two TSDoc plugins and their rules.
3. **Prints the install command.** It detects your package manager and shows the exact command for the four dev dependencies, or runs it with `--install`.

## What it writes

On a small project, the run looks like this:

```text
Unknown tags (register or remove): @property, @function, @return, @typedef
✓ wrote tsdoc.json
✓ wrote eslint.config.mjs
Next: install dev dependencies —
  npm install -D @microsoft/tsdoc @microsoft/tsdoc-config eslint-plugin-tsdoc eslint-plugin-tsdoc-require-2
```

The unknown tags are JSDoc tags such as `@function` and `@typedef`. Do not register them: `convert` removes them. Registering a tag you are about to delete would only hide the problem.

The ESLint diff for a config that used `tseslint.config(...)`:

```diff
 import tseslint from "typescript-eslint";
+import tsdoc from "eslint-plugin-tsdoc";
+import tsdocRequire from "eslint-plugin-tsdoc-require-2";

 export default tseslint.config(
+  {
+    files: ["src/**/*.ts", "src/**/*.tsx"],
+    plugins: {
+      tsdoc,
+      "tsdoc-require-2": tsdocRequire,
+    },
+    rules: {
+      "tsdoc/syntax": "error",
+      "tsdoc-require-2/require": "warn",
+      "tsdoc-require-2/require-param": "off",
+      "tsdoc-require-2/require-returns": "off",
+    },
+  },
+  {
+    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
+    rules: {
+      "tsdoc/syntax": "off",
+      "tsdoc-require-2/require": "off",
+    },
+  },
   ...tseslint.configs.recommended,
 );
```

## Why these rules

| Rule | Setting | Reason |
| ---- | ------- | ------ |
| `tsdoc/syntax` | `error` | A comment the parser rejects is always a bug |
| `tsdoc-require-2/require` | `warn` | Progressive: missing documentation is reported without failing the build while you migrate. `escalate` raises it to `error` at the end |
| `require-param`, `require-returns` | `off` | They report false positives on interfaces, types and constants |
| Test files | both `off` | Tests rarely carry documentation, and the other commands skip them by default for the same reason |

`--strict` starts `tsdoc-require-2/require` at `error` from day one, which suits a new project or a small codebase.

## Config shapes it understands

The patch recognises four ways of writing a flat config, each also when it is assigned to a variable that is then default-exported (what `create-next-app` generates).

| Shape | Example |
| ----- | ------- |
| `defineConfig` with an array | `export default defineConfig([ … ])` |
| `defineConfig`, variadic | `export default defineConfig(a, b, c)` |
| `tseslint.config(…)` | `export default tseslint.config(…)` |
| a bare array | `export default [ … ]` |

For any other shape it does not guess. It prints a snippet you can paste, and leaves the file alone.

## Flags

| Flag | Purpose |
| ---- | ------- |
| `--dry-run` | Show the diff without writing |
| `--strict` | Start the presence rule at `error` |
| `--install` | Run the detected package manager to install the four dev dependencies |
| `--cwd <dir>` | Project directory, default `.` |

## Check your work

```bash
git diff            # the ESLint and tsdoc.json changes, and nothing else
npx eslint src      # runs with the new rules once the four packages are installed
```
