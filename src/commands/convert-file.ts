/**
 * Orchestrates conversion of a single source file's comments.
 *
 * @remarks
 * The composition point between the scanner (comment extraction, member
 * lookup, edit application) and the transformer (the rule pipeline). Kept pure
 * — it performs no I/O — so it can be unit-tested and reused by both `scan`
 * (counting) and `convert` (writing).
 *
 * It is also the only place that can decide what happens to a `@property` tag,
 * because that decision needs both the comment and the declaration below it,
 * and the pipeline is handed comment text alone.
 *
 * @since 0.1.0
 */

import { mayHoldPropertyTag, readPropertyTags } from "@/parser";
import {
  applyEdits,
  collectExportedDeclarations,
  collectMemberTargets,
  extractJsDocComments,
  type MemberTarget,
  type SourceEdit,
} from "@/scanner";
import {
  canPromote,
  renderPromoted,
  runPipeline,
  type RuleContext,
} from "@/transformer";

/**
 * What one `convert` run may do to a file.
 *
 * @remarks
 * Extends the rule context rather than widening it, because promotion is not
 * something a rule can do: it changes a `//` run into a `/** *\/` comment, and
 * a rule only ever sees the inside of a comment that already exists.
 */
export interface ConvertOptions extends RuleContext {
  /**
   * Rewrite a run of `//` prose above an undocumented export as the doc comment
   * it was already serving as. Off by default — it edits lines no other rule
   * touches.
   */
  readonly promoteLineComments?: boolean;
}

/**
 * The result of converting every comment in one source file.
 */
export interface FileConversion {
  /** The full source text after all edits were applied. */
  readonly output: string;
  /** Whether anything changed. */
  readonly changed: boolean;
  /** How many comments were rewritten. */
  readonly commentsChanged: number;
  /** How many members gained a doc comment moved off a `@property`. */
  readonly membersDocumented: number;
  /** How many runs of `//` prose were rewritten as doc comments. */
  readonly commentsPromoted: number;
  /** The distinct rule names that fired across the file. */
  readonly appliedRules: readonly string[];
}

/** What one comment's `@property` tags resolved to. */
interface PropertyPlan {
  /** Names the pipeline may delete from the comment. */
  readonly removable: readonly string[];
  /** Doc comments to insert on members, as zero-width edits. */
  readonly insertions: readonly SourceEdit[];
}

const EMPTY_PLAN: PropertyPlan = { removable: [], insertions: [] };

/**
 * Renders a member doc comment on its own line, indented to match the member.
 *
 * @param description - The prose moved off the `@property` tag.
 * @param indent - The member's own indentation.
 * @returns The comment text plus the newline and indent that put the member
 * back where it was.
 */
function memberComment(description: string, indent: string): string {
  return `/** ${description} */\n${indent}`;
}

/**
 * Indexes a declaration's members by the name a `@property` tag would use.
 *
 * @remarks
 * Built once per comment so resolving a tag is a lookup rather than a scan of
 * every member — a comment documenting a wide interface carries a tag per
 * member, and pairing them by scanning grows with the product of the two.
 *
 * @param members - The members of the declaration below the comment.
 * @returns Each name mapped to the first member that declares it.
 */
function byName(
  members: readonly MemberTarget[],
): ReadonlyMap<string, MemberTarget> {
  const index = new Map<string, MemberTarget>();
  for (const member of members) {
    // First declaration wins. A repeated key is invalid TypeScript, but the
    // scanner parses without type checking and so reports both; letting the
    // later one overwrite would move a description past the member a reader
    // pairs it with.
    if (!index.has(member.name)) {
      index.set(member.name, member);
    }
  }
  return index;
}

/**
 * Decides what to do with each `@property` tag on one comment.
 *
 * @remarks
 * Three outcomes, and the default among them is the cautious one. A tag whose
 * member already has a doc comment is redundant and can go. A tag naming a
 * member with no documentation has its description moved onto that member and
 * then goes. A tag that names nothing the declaration declares — or that sits
 * on a declaration with no members at all, such as `export const styles = […]`
 * — stays exactly where it is, because deleting it would destroy the only copy
 * of that prose and there is nowhere to put it instead.
 *
 * A repeated tag for a member that is already being written keeps its place for
 * the same reason: only the first description would survive the move.
 *
 * @param comment - The full `/** *\/` comment text.
 * @param members - The members of the declaration below it, or `undefined` when
 * it documents something with no named members.
 * @returns The names the pipeline may delete and the member comments to insert.
 */
function planProperties(
  comment: string,
  members: readonly MemberTarget[] | undefined,
): PropertyPlan {
  const tags = readPropertyTags(comment);
  if (tags.length === 0 || members === undefined) {
    return EMPTY_PLAN;
  }

  const removable: string[] = [];
  const insertions: SourceEdit[] = [];
  const written = new Set<string>();
  const index = byName(members);

  for (const tag of tags) {
    const member = index.get(tag.name);
    if (member === undefined) {
      continue;
    }
    if (member.hasDocComment) {
      removable.push(tag.name);
      continue;
    }
    if (written.has(tag.name)) {
      continue;
    }
    if (tag.description !== "") {
      insertions.push({
        pos: member.insertPos,
        end: member.insertPos,
        text: memberComment(tag.description, member.indent),
      });
    }
    written.add(tag.name);
    removable.push(tag.name);
  }

  return { removable, insertions };
}

/**
 * Rewrites the `//` prose above undocumented exports as doc comments.
 *
 * @remarks
 * Only a run attached to an export that has no doc comment is a candidate: a
 * `//` note beside something already documented is a remark about the code, not
 * the documentation of it, and `check` never asks for one.
 *
 * The rendered comment goes back through the rule pipeline before it is
 * emitted. Prose written as `//` can carry JSDoc spellings a person typed out
 * of habit, and a promoted comment that the very next `convert` run would
 * rewrite again is not idempotent.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name (selects the TS/TSX dialect).
 * @param context - The rule context to normalize promoted comments with.
 * @returns One replacement edit per promoted run.
 */
function planPromotions(
  sourceText: string,
  fileName: string,
  context: RuleContext,
): readonly SourceEdit[] {
  const edits: SourceEdit[] = [];

  for (const declaration of collectExportedDeclarations(sourceText, fileName)) {
    const { comment, indent } = declaration;
    if (comment === undefined || comment.kind !== "line") {
      continue;
    }
    const lines = comment.text.split("\n");
    if (!canPromote(lines)) {
      continue;
    }
    const promoted = renderPromoted(lines, indent);
    edits.push({
      pos: comment.pos,
      end: comment.end,
      text: runPipeline(promoted, context).output,
    });
  }

  return edits;
}

/**
 * Converts all JSDoc comments in a source file to TSDoc.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name (selects the TS/TSX dialect).
 * @param context - What this run may do (for example `lite`).
 * @returns The rewritten source plus per-file change metadata.
 */
export function convertSourceText(
  sourceText: string,
  fileName: string,
  context: ConvertOptions,
): FileConversion {
  const comments = extractJsDocComments(sourceText, fileName);
  // The member lookup costs a second parse of the file, and it is only ever
  // read to place a `@property` description. Skip it when the text cannot hold
  // one: `--lite` runs only the `@param` / `@returns` hygiene rules and never
  // touches the tag, and a file holding no tag has nothing to relocate. The
  // test is the parser's own, so this cannot come to disagree with what the
  // reader accepts — a guard that did would skip the lookup for a real tag and
  // silently make it unrelocatable. Measured over this repo's 104 source files,
  // a full `convert` pass drops from 55 ms to 37 ms.
  const needsMembers = !context.lite && mayHoldPropertyTag(sourceText);
  const memberTargets = needsMembers
    ? collectMemberTargets(sourceText, fileName)
    : new Map<number, readonly MemberTarget[]>();

  // Promotion is planned from the original text, before any comment is
  // rewritten, so the offsets it reports still refer to this source. `applyEdits`
  // splices every edit in one pass, and a `//` run never overlaps the doc
  // comments the pipeline rewrites.
  const promotions =
    context.promoteLineComments === true && !context.lite
      ? planPromotions(sourceText, fileName, context)
      : [];

  const edits: SourceEdit[] = [...promotions];
  const appliedRules = new Set<string>();
  let commentsChanged = 0;
  let membersDocumented = 0;

  for (const comment of comments) {
    const plan = context.lite
      ? EMPTY_PLAN
      : planProperties(comment.text, memberTargets.get(comment.pos));

    const result = runPipeline(comment.text, {
      ...context,
      removableProperties: plan.removable,
    });

    if (result.changed) {
      edits.push({ pos: comment.pos, end: comment.end, text: result.output });
      commentsChanged += 1;
      for (const rule of result.appliedRules) {
        appliedRules.add(rule);
      }
    }

    // Only move a description once the tag carrying it is actually leaving. If
    // the pipeline declined the rewrite, writing the member comment would
    // duplicate the prose rather than relocate it.
    if (result.changed && plan.insertions.length > 0) {
      edits.push(...plan.insertions);
      membersDocumented += plan.insertions.length;
    }
  }

  return {
    output: applyEdits(sourceText, edits),
    changed: edits.length > 0,
    commentsChanged,
    membersDocumented,
    commentsPromoted: promotions.length,
    appliedRules: [...appliedRules],
  };
}
