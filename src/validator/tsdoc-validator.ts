/**
 * Validation of doc comments against the official TSDoc parser.
 *
 * @remarks
 * Every other domain in this package reasons about comments with its own
 * lightweight parsing, which is the right tool for *rewriting* text. Deciding
 * whether a comment is **valid** is a different question, and answering it with
 * our own rules would only prove the comment satisfies us. So `check` defers to
 * `@microsoft/tsdoc` itself — the same parser `eslint-plugin-tsdoc` runs, so a
 * clean `check` predicts a clean lint.
 *
 * The project's `tsdoc.json` is loaded and applied before parsing. Without it
 * every custom tag (`@since` above all) is reported as `tsdoc-undefined-tag`,
 * which would flood a real codebase with violations that its own lint accepts —
 * the same false-positive trap that keeps `require-param` / `require-returns`
 * disabled by default.
 *
 * Comments are parsed through {@link https://tsdoc.org | TSDoc}'s `parseRange`
 * over the whole file buffer rather than `parseString` over the comment text, so
 * reported positions are already file coordinates and need no remapping.
 *
 * @since 0.1.0
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";

import { extractJsDocComments } from "@/scanner";

/** One problem the TSDoc parser reported in a comment. */
export interface TsdocViolation {
  /** 1-based line in the source file. */
  readonly line: number;
  /** 1-based column in the source file. */
  readonly column: number;
  /** The parser's message identifier, for example `tsdoc-undefined-tag`. */
  readonly messageId: string;
  /** The human-readable problem description. */
  readonly message: string;
}

/** A parser bound to one project's TSDoc configuration. */
export interface TsdocValidator {
  /**
   * Absolute path of the `tsdoc.json` that was **found**, or `undefined` when
   * the project has none.
   *
   * @remarks
   * Discovery, not application: a file that was found but could not be used
   * still reports its path, so the caller can name it. Check
   * {@link TsdocValidator.configErrors} to know whether it was applied.
   */
  readonly configPath: string | undefined;
  /**
   * Problems that stopped `tsdoc.json` from being applied. A non-empty list
   * means custom tags are missing, so violations would be untrustworthy.
   */
  readonly configErrors: readonly string[];
  /**
   * Validates every doc comment in one source file.
   *
   * @param sourceText - The full file contents.
   * @param fileName - The file name, used to pick the TS/TSX dialect.
   * @returns The violations, in source order.
   */
  validate(sourceText: string, fileName: string): readonly TsdocViolation[];
}

/** What probing `tsdoc.json` found. */
type ConfigProbe =
  | { readonly status: "absent" }
  | { readonly status: "present" }
  | { readonly status: "unreadable"; readonly reason: string };

/**
 * Probes `tsdoc.json`, keeping "not there" apart from "cannot be reached".
 *
 * @remarks
 * Swallowing every `stat` failure as "absent" would let a permission wall on a
 * parent directory read as a project that never configured TSDoc, and the run
 * would then report every custom tag as undefined. `ENOENT` is a file that is
 * simply not there; `ENOTDIR` means a path component is not a directory, so it
 * cannot be there either. Anything else is a real failure.
 *
 * @param path - The absolute path to probe.
 * @returns What was found.
 */
async function probeConfig(path: string): Promise<ConfigProbe> {
  try {
    await stat(path);
    return { status: "present" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { status: "absent" };
    }
    return {
      status: "unreadable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Builds a validator for a project, applying its `tsdoc.json` when present.
 *
 * @remarks
 * `@microsoft/tsdoc` and `@microsoft/tsdoc-config` are imported lazily so the
 * other subcommands never pay to load a parser they do not use.
 *
 * The config file is located by probing `<cwd>/tsdoc.json` — where `init` writes
 * it — rather than through `TSDocConfigFile.loadForFolder`. That helper walks up
 * until it meets a `package.json` or `tsconfig.json` and only then looks for a
 * `tsdoc.json`, so pointing it at a plain directory yields a "File not found"
 * *error* rather than the plain absence of a config. Probing directly keeps
 * "this project has no tsdoc.json yet" (the normal state before `init` runs)
 * distinct from "its tsdoc.json is broken", which is the only case worth
 * refusing to run over. `extends` is still honoured, since `loadFile` resolves
 * it.
 *
 * @param cwd - The absolute project directory to read `tsdoc.json` from.
 * @returns A {@link TsdocValidator} bound to that configuration.
 */
export async function createTsdocValidator(
  cwd: string,
): Promise<TsdocValidator> {
  const { TSDocConfiguration, TSDocParser, TextRange } = await import(
    "@microsoft/tsdoc"
  );
  const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");

  const configuration = new TSDocConfiguration();
  const configPath = join(cwd, "tsdoc.json");
  const probe = await probeConfig(configPath);

  let configErrors: readonly string[] = [];

  if (probe.status === "unreadable") {
    configErrors = [probe.reason];
  } else if (probe.status === "present") {
    try {
      const configFile = TSDocConfigFile.loadFile(configPath);
      if (configFile.hasErrors) {
        // A config that failed to parse defines no tags, so applying it would
        // leave every custom tag undefined. The caller stops instead.
        configErrors = configFile.log.messages.map((message) => message.text);
      } else {
        configFile.configureParser(configuration);
      }
    } catch (error) {
      // `stat` succeeds on a file the process may not read, so a permission wall
      // surfaces only here, where the loader actually opens it. Letting it throw
      // would exit `1` through the command's generic handler instead of the `2`
      // documented for a config that exists but cannot be used.
      configErrors = [error instanceof Error ? error.message : String(error)];
    }
  }

  const parser = new TSDocParser(configuration);

  return {
    configPath: probe.status === "absent" ? undefined : configPath,
    configErrors,
    validate(sourceText, fileName) {
      const violations: TsdocViolation[] = [];

      for (const comment of extractJsDocComments(sourceText, fileName)) {
        const range = TextRange.fromStringRange(
          sourceText,
          comment.pos,
          comment.end,
        );
        for (const message of parser.parseRange(range).log.messages) {
          const location = message.textRange.getLocation(message.textRange.pos);
          violations.push({
            line: location.line,
            column: location.column,
            messageId: message.messageId,
            message: message.unformattedText,
          });
        }
      }

      return violations;
    },
  };
}
