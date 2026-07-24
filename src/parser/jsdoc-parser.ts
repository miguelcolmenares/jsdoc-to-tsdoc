/**
 * Lightweight structural inspection of a `/** *\/` comment.
 *
 * @remarks
 * These helpers answer coarse questions about a comment — which block tags it
 * contains, whether it carries type-brace annotations — without a full AST.
 * They power classification in `scan` and the "will this change?" preview in
 * `convert`. Deeper structural editing is the transformer pipeline's job.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser/comment-lines";
import { leadingTag } from "@/parser/tag-registry";

/**
 * Collects every distinct block tag present in a comment, ignoring tags that
 * appear inside fenced code blocks.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns Lowercased tag tokens (for example `@param`) in first-seen order.
 */
export function getBlockTags(comment: string): readonly string[] {
  const seen = new Set<string>();
  mapCommentLines(comment, (content, context) => {
    if (context.inFence) {
      return content;
    }
    const tag = leadingTag(content);
    if (tag) {
      seen.add(tag);
    }
    return content;
  });
  return [...seen];
}

/**
 * Detects JSDoc `{Type}` brace annotations following a `@param`, `@returns`, or
 * `@property` tag — the hallmark of un-migrated JSDoc.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns `true` when at least one type-brace annotation is present.
 */
export function hasTypeBraces(comment: string): boolean {
  let found = false;
  mapCommentLines(comment, (content, context) => {
    if (
      !context.inFence &&
      /^@(?:param|returns?|property|prop|type)\s+\{[^}]*\}/.test(content.trim())
    ) {
      found = true;
    }
    return content;
  });
  return found;
}
