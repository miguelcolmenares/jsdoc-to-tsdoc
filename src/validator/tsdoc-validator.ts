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
  /** Absolute path of the `tsdoc.json` applied, or `undefined` when none exists. */
  readonly configPath: string | undefined;
  /**
   * Problems found while loading `tsdoc.json`. A non-empty list means custom
   * tags may be missing, so violations would be untrustworthy.
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

/**
 * Tests whether a path exists.
 *
 * @param path - The absolute path to probe.
 * @returns `true` when `stat` succeeds.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
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
  const configFile = (await exists(configPath))
    ? TSDocConfigFile.loadFile(configPath)
    : undefined;

  // A config that failed to parse defines no tags, so applying it would leave
  // every custom tag undefined. The caller stops on `configErrors` instead.
  if (configFile !== undefined && !configFile.hasErrors) {
    configFile.configureParser(configuration);
  }

  const parser = new TSDocParser(configuration);

  return {
    configPath: configFile === undefined ? undefined : configPath,
    configErrors:
      configFile !== undefined && configFile.hasErrors
        ? configFile.log.messages.map((message) => message.text)
        : [],
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
