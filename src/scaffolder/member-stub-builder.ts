/**
 * Rendering of TSDoc stub comments for undocumented interface (and
 * type-literal alias) members.
 *
 * @remarks
 * Reuses {@link renderComment} and {@link placeStub} from `stub-builder.ts` —
 * rendering and line-placement are identical to a header stub, and only what
 * to say about a member differs. That, in turn, comes purely from the
 * member's own name and its declared type ({@link MemberDeclaration.isFunctionLike}):
 * a callback prop gets the verb-style summary and `@param`/`@returns` tags a
 * function declaration would, a plain data property gets the noun-style
 * summary a `type`/`interface` header would. Never a guess at what the member
 * *means* — the same deterministic, syntax-only spirit as every other rule in
 * this pipeline (AGENTS.md §4.2).
 *
 * @since 0.3.0
 */

import {
  inferFunctionSummary,
  inferNounSummary,
} from "@/scaffolder/name-inference";
import {
  paramLines,
  placeStub,
  renderComment,
} from "@/scaffolder/stub-builder";
import type { MemberDeclaration } from "@/scanner";

/**
 * Selects the summary sentence for a member.
 *
 * @param member - The member being documented.
 * @returns The inferred one-line summary.
 */
function summaryFor(member: MemberDeclaration): string {
  return member.isFunctionLike
    ? inferFunctionSummary(member.name)
    : inferNounSummary(member.name);
}

/**
 * Builds the tag lines (everything after the summary) for a member.
 *
 * @param member - The member being documented.
 * @returns `@param`/`@returns` lines for a callback-shaped member; empty for
 * a plain data property.
 */
function tagLinesFor(member: MemberDeclaration): readonly string[] {
  if (!member.isFunctionLike) {
    return [];
  }
  const lines = [...paramLines(member.parameters)];
  if (member.hasReturnValue) {
    lines.push("@returns TODO(tsdoc): describe the return value.");
  }
  return lines;
}

/**
 * Builds the TSDoc stub comment for one undocumented interface or
 * type-literal member.
 *
 * @param member - The member to document.
 * @returns The comment block, indented and newline-terminated, ready to
 * insert at the member's {@link MemberDeclaration.insertPos}.
 */
export function buildMemberStub(member: MemberDeclaration): string {
  const comment = renderComment(
    summaryFor(member),
    tagLinesFor(member),
    member.indent,
  );
  return placeStub(comment, member.indent, member.ownsLine);
}
