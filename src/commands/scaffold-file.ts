/**
 * Orchestrates stub generation for a single source file's undocumented exports.
 *
 * @remarks
 * The composition point between the scanner (export inventory, edit application)
 * and the scaffolder (stub rendering). Kept pure — it performs no I/O — so it can
 * be unit-tested and reused by both `scan` (counting) and `scaffold` (writing),
 * mirroring {@link convertSourceText}.
 *
 * @since 0.1.0
 */

import { buildStub } from "@/scaffolder";
import {
  applyEdits,
  collectExportedDeclarations,
  undocumentedDeclarations,
  type ExportKind,
  type SourceEdit,
} from "@/scanner";

/**
 * A per-kind tally of the stubs generated for one run.
 */
export type StubCounts = Readonly<Partial<Record<ExportKind, number>>>;

/**
 * The result of scaffolding one source file.
 */
export interface FileScaffold {
  /** The full source text with every stub inserted. */
  readonly output: string;
  /** Whether any stub was inserted. */
  readonly changed: boolean;
  /** How many exports received a stub. */
  readonly stubsAdded: number;
  /** How many exports were found, documented or not. */
  readonly exportsFound: number;
  /** The generated stubs broken down by export kind. */
  readonly counts: StubCounts;
}

/**
 * Generates TSDoc stubs for every undocumented export in a source file.
 *
 * @remarks
 * Each stub is inserted at the start of its declaration's line. Because
 * {@link applyEdits} splices from the highest offset down, the insertion points
 * captured during the inventory stay valid as edits are applied.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name (selects the TS/TSX dialect).
 * @returns The rewritten source plus per-file stub metadata.
 */
export function scaffoldSourceText(
  sourceText: string,
  fileName: string,
): FileScaffold {
  const declarations = collectExportedDeclarations(sourceText, fileName);
  const undocumented = undocumentedDeclarations(declarations);

  const edits: SourceEdit[] = [];
  const counts: Partial<Record<ExportKind, number>> = {};

  for (const declaration of undocumented) {
    edits.push({
      pos: declaration.insertPos,
      end: declaration.insertPos,
      text: buildStub(declaration),
    });
    counts[declaration.kind] = (counts[declaration.kind] ?? 0) + 1;
  }

  return {
    output: applyEdits(sourceText, edits),
    changed: edits.length > 0,
    stubsAdded: edits.length,
    exportsFound: declarations.length,
    counts,
  };
}
