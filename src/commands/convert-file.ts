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

import { readPropertyTags } from "@/parser";
import {
  applyEdits,
  collectMemberTargets,
  extractJsDocComments,
  type MemberTarget,
  type SourceEdit,
} from "@/scanner";
import { runPipeline, type RuleContext } from "@/transformer";

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

/** Cheap pre-filter for text that could hold a `@property` / `@prop` tag. */
const PROPERTY_HINT = /@prop/i;

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

  for (const tag of tags) {
    const member = members.find((candidate) => candidate.name === tag.name);
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
  // The member lookup costs a second parse of the file, and it is only ever
  // read to place a `@property` description. Skip it when the text cannot hold
  // one: `--lite` runs only the `@param` / `@returns` hygiene rules and never
  // touches the tag, and a file without the substring has no tag to relocate.
  // `@prop` covers `@property` too, and the match is case-insensitive because
  // the reader is — a case-sensitive guard here would skip the lookup for a
  // file whose only tag is `@Property`, silently making it unrelocatable. A
  // false positive costs only the parse that would have happened anyway.
  // Measured over this repo's 104 source files, a full `convert` pass drops
  // from 55 ms to 37 ms.
  const needsMembers = !context.lite && PROPERTY_HINT.test(sourceText);
  const memberTargets = needsMembers
    ? collectMemberTargets(sourceText, fileName)
    : new Map<number, readonly MemberTarget[]>();

  const edits: SourceEdit[] = [];
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
    appliedRules: [...appliedRules],
  };
}
