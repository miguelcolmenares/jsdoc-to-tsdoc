/**
 * @packageDocumentation
 * `init` subcommand — bootstraps a project for TSDoc: generates `tsdoc.json`,
 * patches the ESLint flat config with the TSDoc plugins/rules, and reports the
 * dev dependencies to install.
 *
 * @remarks
 * Starts the presence rule at `warn` (progressive) by default; `--strict` opts
 * into `error` up front. Nothing is written under `--dry-run`, which instead
 * prints a unified diff of every file the command would create or modify.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { parseReportFormat } from "@/commands/options";
import {
  collectProjectTags,
  detectProject,
  generateTsdocJson,
  installCommand,
  mergeTsdocJson,
  missingPackages,
  patchEslintFlatConfig,
} from "@/generator";
import {
  createColors,
  formatFileDiff,
  shouldUseColor,
  toJsonReport,
  type Colors,
} from "@/reporter";
import { writeFileText } from "@/writer";

interface FileChange {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

/**
 * The `init` command definition.
 */
export default defineCommand({
  meta: {
    name: "init",
    description: "Bootstrap tsdoc.json + ESLint rules (progressive by default).",
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to bootstrap.",
      default: ".",
    },
    "dry-run": {
      type: "boolean",
      description: "Show diffs and the install command without writing.",
      alias: "d",
    },
    preview: {
      type: "boolean",
      description: "Alias for --dry-run.",
    },
    strict: {
      type: "boolean",
      description: "Start tsdoc-require-2/require at \"error\" instead of \"warn\".",
    },
    install: {
      type: "boolean",
      description: "Run the package manager to install missing dev dependencies.",
    },
    report: {
      type: "string",
      description: "Machine-readable output: json | md.",
    },
  },
  async run({ args }) {
    try {
      const cwd = resolve(String(args.cwd ?? "."));
      const dryRun = Boolean(args["dry-run"]) || Boolean(args.preview);
      const severity = args.strict ? "error" : "warn";
      const reportFormat = parseReportFormat(args.report);
      const useColor =
        reportFormat === undefined &&
        shouldUseColor(Boolean(process.stdout.isTTY));
      const colors = createColors(useColor);

      const layout = await detectProject(cwd);
      const tagReport = await collectProjectTags(cwd);
      const blockTags = tagReport.blockTagsToRegister;

      const changes: FileChange[] = [];
      let manualEslintSnippet: string | undefined;

      const tsdocBefore = layout.existingTsdocJsonPath
        ? await readFile(layout.existingTsdocJsonPath, "utf8")
        : "";
      const tsdocPath = layout.existingTsdocJsonPath ?? join(cwd, "tsdoc.json");
      const tsdocAfter = layout.existingTsdocJsonPath
        ? mergeTsdocJson(tsdocBefore, blockTags)
        : generateTsdocJson(blockTags);
      if (tsdocAfter !== tsdocBefore) {
        changes.push({ path: tsdocPath, before: tsdocBefore, after: tsdocAfter });
      }

      if (layout.eslintConfigPath) {
        const before = await readFile(layout.eslintConfigPath, "utf8");
        const patch = patchEslintFlatConfig(before, { severity });
        if (patch.ok && patch.changed) {
          changes.push({ path: layout.eslintConfigPath, before, after: patch.content });
        } else if (!patch.ok) {
          manualEslintSnippet = patch.snippet;
        }
      }

      const packages = missingPackages(layout.installedDependencies);
      const command = installCommand(layout.packageManager, packages);

      if (!dryRun) {
        for (const change of changes) {
          await writeFileText(change.path, change.after);
        }
        if (args.install && packages.length > 0) {
          await runInstall(layout.packageManager, packages, cwd);
        }
      }

      if (reportFormat === "json") {
        process.stdout.write(
          `${toJsonReport({
            command: "init",
            wrote: !dryRun,
            severity,
            changes: changes.map((change) => ({ path: relative(cwd, change.path) })),
            customTags: blockTags,
            unknownTags: tagReport.unknownTags,
            packagesToInstall: packages,
            installCommand: command,
            eslintConfigFound: layout.eslintConfigPath !== undefined,
            eslintManualSnippet: manualEslintSnippet !== undefined,
          })}\n`,
        );
        return;
      }

      renderReport(
        {
          cwd,
          dryRun,
          changes,
          command,
          blockTags,
          unknownTags: tagReport.unknownTags,
          manualEslintSnippet,
          eslintConfigFound: layout.eslintConfigPath !== undefined,
        },
        colors,
      );
    } catch (error) {
      process.stderr.write(
        `jsdoc-to-tsdoc: init failed — ${(error as Error).message}\n`,
      );
      process.exitCode = 1;
    }
  },
});

interface RenderInput {
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly changes: readonly FileChange[];
  readonly command: string;
  readonly blockTags: readonly string[];
  readonly unknownTags: readonly string[];
  readonly manualEslintSnippet: string | undefined;
  readonly eslintConfigFound: boolean;
}

/**
 * Renders the human-oriented `init` summary: file diffs (dry-run) or write
 * confirmations, detected custom tags, and next steps.
 *
 * @param input - The computed plan and context.
 * @param colors - Style functions for the terminal.
 */
function renderReport(input: RenderInput, colors: Colors): void {
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  if (input.blockTags.length > 0) {
    out(colors.cyan(`Custom tags registered: ${input.blockTags.join(", ")}`));
  }
  if (input.unknownTags.length > 0) {
    out(
      colors.yellow(
        `Unknown tags (register or remove): ${input.unknownTags.join(", ")}`,
      ),
    );
  }

  if (input.changes.length === 0) {
    out(colors.green("✓ Already bootstrapped — no config changes needed."));
  } else if (input.dryRun) {
    for (const change of input.changes) {
      out(formatFileDiff(relative(input.cwd, change.path), change.before, change.after, colors));
    }
    out(colors.dim("Preview only — re-run without --dry-run to apply."));
  } else {
    for (const change of input.changes) {
      out(colors.green(`✓ wrote ${relative(input.cwd, change.path)}`));
    }
  }

  if (!input.eslintConfigFound) {
    out(colors.yellow("No ESLint flat config found — see docs to add the TSDoc rules."));
  }
  if (input.manualEslintSnippet !== undefined) {
    out(colors.yellow("Could not patch ESLint config automatically. Add manually:"));
    out(input.manualEslintSnippet);
  }

  if (input.command === "") {
    out(colors.green("✓ All TSDoc dev dependencies already installed."));
  } else {
    out(colors.bold(`Next: install dev dependencies —\n  ${input.command}`));
  }
}

/**
 * Runs the package manager to install the given dev dependencies.
 *
 * @param manager - The detected package manager.
 * @param packages - The packages to install.
 * @param cwd - The project directory to run in.
 */
async function runInstall(
  manager: string,
  packages: readonly string[],
  cwd: string,
): Promise<void> {
  const { spawn } = await import("node:child_process");
  const flag = manager === "npm" ? "install" : "add";
  const dev = manager === "bun" ? "-d" : "-D";
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(manager, [flag, dev, ...packages], {
      cwd,
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${manager} exited with code ${code ?? "null"}`));
      }
    });
  });
}
