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

import { buildMemberStub, buildStub } from "@/scaffolder";
import {
  applyEdits,
  collectExportedDeclarations,
  undocumentedDeclarations,
  type ExportKind,
  type SourceEdit,
} from "@/scanner";

/**
 * What one `scaffold` run may do to a file.
 */
export interface ScaffoldOptions {
  /**
   * Also stub each undocumented interface (or type-literal alias) member,
   * individually, rather than only the declaration's own header.
   *
   * @remarks
   * Off by default. A per-member stub is generated for every member with no
   * doc comment of its own, whether or not the declaration's header is
   * already documented — the two are independent gaps. Off by default because
   * it can meaningfully multiply how much boilerplate one run produces (one
   * comment per member instead of one per declaration), matching how
   * `convert --promote-line-comments` stays opt-in for the same reason: it
   * edits lines no other mode touches.
   */
  readonly members?: boolean;
}

/**
 * A per-kind tally of the stubs generated for one run.
 */
export type StubCounts = Readonly<Partial<Record<ExportKind, number>>>;

/**
 * An undocumented export skipped because a doc-shaped comment was found
 * stranded nearby, rather than stubbed next to text that may already document
 * it.
 */
export interface OrphanedCommentWarning {
  /** The undocumented export's name. */
  readonly name: string;
  /** 1-based line of the declaration that was skipped. */
  readonly line: number;
  /** 1-based line where the stranded comment begins. */
  readonly orphanLine: number;
}

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
  /**
   * How many interface/type-literal members received a stub, under
   * {@link ScaffoldOptions.members}. `0` when the option is off.
   */
  readonly memberStubsAdded: number;
  /** How many exports were found, documented or not. */
  readonly exportsFound: number;
  /** The generated stubs broken down by export kind. */
  readonly counts: StubCounts;
  /**
   * Undocumented exports left unstubbed because of a nearby orphaned comment.
   *
   * @remarks
   * These still count toward an undocumented total for reporting purposes, but
   * not toward {@link stubsAdded} — nothing was written for them.
   */
  readonly orphanedWarnings: readonly OrphanedCommentWarning[];
}

/**
 * Generates TSDoc stubs for every undocumented export in a source file.
 *
 * @remarks
 * Each stub is inserted at its declaration's anchor offset. Every offset is
 * read from the original source and {@link applyEdits} consumes them in a
 * single left-to-right pass, so the insertion points captured during the
 * inventory stay valid as edits are applied.
 *
 * With {@link ScaffoldOptions.members}, an undocumented interface/type-literal
 * member is stubbed too, regardless of whether its own declaration's header is
 * already documented — a member insertion is at an offset strictly inside its
 * declaration, so it never collides with the declaration's own header stub in
 * the same left-to-right pass.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name (selects the TS/TSX dialect).
 * @param options - What this run may also do, beyond header stubs.
 * @returns The rewritten source plus per-file stub metadata.
 */
export function scaffoldSourceText(
  sourceText: string,
  fileName: string,
  options: ScaffoldOptions = {},
): FileScaffold {
  const declarations = collectExportedDeclarations(sourceText, fileName);
  const undocumented = undocumentedDeclarations(declarations);

  const edits: SourceEdit[] = [];
  const counts: Partial<Record<ExportKind, number>> = {};
  const orphanedWarnings: OrphanedCommentWarning[] = [];

  for (const declaration of undocumented) {
    if (declaration.orphanedComment !== undefined) {
      orphanedWarnings.push({
        name: declaration.name,
        line: declaration.line,
        orphanLine: declaration.orphanedComment.line,
      });
      continue;
    }
    edits.push({
      pos: declaration.insertPos,
      end: declaration.insertEnd,
      text: buildStub(declaration),
    });
    counts[declaration.kind] = (counts[declaration.kind] ?? 0) + 1;
  }
  const stubsAdded = edits.length;

  let memberStubsAdded = 0;
  if (options.members === true) {
    for (const declaration of declarations) {
      for (const member of declaration.members ?? []) {
        if (member.hasDocComment) {
          continue;
        }
        edits.push({
          pos: member.insertPos,
          end: member.insertEnd,
          text: buildMemberStub(member),
        });
        memberStubsAdded += 1;
      }
    }
  }

  return {
    output: applyEdits(sourceText, edits),
    changed: edits.length > 0,
    stubsAdded,
    memberStubsAdded,
    exportsFound: declarations.length,
    counts,
    orphanedWarnings,
  };
}
