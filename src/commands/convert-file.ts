/**
 * Orchestrates conversion of a single source file's comments.
 *
 * @remarks
 * The composition point between the scanner (comment extraction, edit
 * application) and the transformer (the rule pipeline). Kept pure — it performs
 * no I/O — so it can be unit-tested and reused by both `scan` (counting) and
 * `convert` (writing).
 *
 * @since 0.1.0
 */

import { applyEdits, extractJsDocComments, type SourceEdit } from "@/scanner";
import { runPipeline, type RuleContext } from "@/transformer";

/**
 * The result of converting every comment in one source file.
 */
export interface FileConversion {
  /** The full source text after all comment edits were applied. */
  readonly output: string;
  /** Whether any comment changed. */
  readonly changed: boolean;
  /** How many comments were rewritten. */
  readonly commentsChanged: number;
  /** The distinct rule names that fired across the file. */
  readonly appliedRules: readonly string[];
}

/**
 * Converts all JSDoc comments in a source file to TSDoc.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name (selects the TS/TSX dialect).
 * @param context - Pipeline flags (for example `lite`).
 * @returns The rewritten source plus per-file change metadata.
 */
export function convertSourceText(
  sourceText: string,
  fileName: string,
  context: RuleContext,
): FileConversion {
  const comments = extractJsDocComments(sourceText, fileName);
  const edits: SourceEdit[] = [];
  const appliedRules = new Set<string>();
  let commentsChanged = 0;

  for (const comment of comments) {
    const result = runPipeline(comment.text, context);
    if (result.changed) {
      edits.push({ pos: comment.pos, end: comment.end, text: result.output });
      commentsChanged += 1;
      for (const rule of result.appliedRules) {
        appliedRules.add(rule);
      }
    }
  }

  return {
    output: applyEdits(sourceText, edits),
    changed: commentsChanged > 0,
    commentsChanged,
    appliedRules: [...appliedRules],
  };
}
