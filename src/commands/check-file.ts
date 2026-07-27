/**
 * Pure per-file collection of the problems `check` reports.
 *
 * @remarks
 * Kept free of I/O so the three problem categories can be unit-tested against
 * source strings, exactly as `convert-file` and `scaffold-file` are.
 *
 * @since 0.1.0
 */

import { convertSourceText } from "@/commands/convert-file";
import {
  collectExportedDeclarations,
  undocumentedDeclarations,
} from "@/scanner";
import type { TsdocValidator } from "@/validator";

/**
 * Why a problem was reported.
 *
 * - `syntax` — the official TSDoc parser rejected the comment.
 * - `missing` — an export carries no doc comment at all.
 * - `legacy` — the comment is valid TSDoc-ish but still holds JSDoc syntax that
 *   `convert` would rewrite, so the migration is not finished.
 */
export type ProblemKind = "syntax" | "missing" | "legacy";

/** One problem found in a source file. */
export interface CheckProblem {
  /** Why it was reported. */
  readonly kind: ProblemKind;
  /** 1-based line in the source file. */
  readonly line: number;
  /** 1-based column, or `1` when the problem is not column-specific. */
  readonly column: number;
  /** The human-readable description. */
  readonly message: string;
}

/** The verdict for one file. */
export interface FileCheck {
  /** Every problem found, ordered by line then column. */
  readonly problems: readonly CheckProblem[];
  /** Count per category, for the run summary. */
  readonly counts: Readonly<Record<ProblemKind, number>>;
}

/** What `check` should look for. */
export interface CheckOptions {
  /** When `true`, only report TSDoc syntax violations. */
  readonly syntaxOnly: boolean;
}

/**
 * Describes an undocumented export in a way that names what to fix.
 *
 * @param name - The declaration's primary name.
 * @param names - Every name the statement binds.
 * @returns The problem message.
 */
function describeMissing(name: string, names: readonly string[]): string {
  // A single statement can bind several names (`export const a = 1, b = 2;`),
  // and they share one comment position, so naming only the first would send
  // the reader looking for a declaration that is already covered.
  const subject = names.length > 1 ? names.join(", ") : name;
  return `Missing TSDoc for ${subject}.`;
}

/**
 * Collects every problem `check` reports for one source file.
 *
 * @param sourceText - The full file contents.
 * @param fileName - The file path, used for the TS/TSX dialect and messages.
 * @param validator - The TSDoc validator bound to the project's config.
 * @param options - What to look for.
 * @returns The file's {@link FileCheck} verdict.
 */
export function checkSourceText(
  sourceText: string,
  fileName: string,
  validator: TsdocValidator,
  options: CheckOptions,
): FileCheck {
  const problems: CheckProblem[] = [];

  for (const violation of validator.validate(sourceText, fileName)) {
    problems.push({
      kind: "syntax",
      line: violation.line,
      column: violation.column,
      message: `${violation.message} (${violation.messageId})`,
    });
  }

  if (!options.syntaxOnly) {
    const declarations = collectExportedDeclarations(sourceText, fileName);
    for (const declaration of undocumentedDeclarations(declarations)) {
      problems.push({
        kind: "missing",
        line: declaration.line,
        column: 1,
        message: describeMissing(declaration.name, declaration.names),
      });
    }

    // `convert` is the authority on what still looks like JSDoc: asking it
    // whether it would rewrite the file is exactly the question, and keeps the
    // two commands from drifting apart on what counts as converted.
    const conversion = convertSourceText(sourceText, fileName, { lite: false });
    if (conversion.changed) {
      problems.push({
        kind: "legacy",
        line: 1,
        column: 1,
        message: `${String(conversion.commentsChanged)} comment(s) still hold JSDoc syntax that \`convert\` would rewrite.`,
      });
    }
  }

  problems.sort((a, b) => a.line - b.line || a.column - b.column);

  const counts = { syntax: 0, missing: 0, legacy: 0 };
  for (const problem of problems) {
    counts[problem.kind] += 1;
  }

  return { problems, counts };
}
