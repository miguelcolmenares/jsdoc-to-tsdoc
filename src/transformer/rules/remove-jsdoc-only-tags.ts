/**
 * Rule: delete JSDoc-only tags with no TSDoc equivalent.
 *
 * @since 0.1.0
 */

import {
  JSDOC_ONLY_TAGS,
  leadingTag,
  mapCommentLines,
  readPropertyTags,
} from "@/parser";
import type { Rule } from "@/transformer/pipeline";

/**
 * Renders a `@property` that cannot move as a prose list item.
 *
 * @param name - The member name the tag documented.
 * @param description - The prose the tag carried.
 * @returns A Markdown list item naming the member in code style.
 */
function asListItem(name: string, description: string): string {
  return `- \`${name}\` — ${description}`;
}

/**
 * Removes JSDoc-only tags — `@typedef`, `@callback`, `@type` — and resolves
 * every `@property` to one of two endings, neither of which loses prose.
 *
 * @remarks
 * The first three describe structures TypeScript declares itself, so deleting
 * them loses nothing. `@property` is different: its description is the only
 * copy of that prose, and TSDoc has no such tag, so leaving it in place trades
 * one defect for another — the comment would survive `convert` and then fail
 * `check` with `tsdoc-undefined-tag`.
 *
 * So the tag always goes, and only its prose's destination varies. When
 * {@link RuleContext.removableProperties} names it, the description is already
 * on the interface member — the caller put it there — and the line is deleted.
 * Otherwise there was nowhere to move it, and the description stays in this
 * comment as a Markdown list item naming the member. That is what a person
 * migrating by hand writes for a shape with no members to document, such as the
 * element type of an exported array literal.
 *
 * A tag carrying no description is deleted either way: there is nothing to keep.
 *
 * Continuation lines are folded into the item or removed with it, so a
 * description wrapped across lines neither loses its tail nor leaves one behind
 * as an unattributed sentence.
 *
 * @example
 * ```typescript
 * removeJsdocOnlyTags.apply("/**\n * @property name - The name\n *\/", {
 *   lite: false,
 *   removableProperties: ["name"],
 * });
 * // → "/**\n *\/"
 *
 * removeJsdocOnlyTags.apply("/**\n * @property name - The name\n *\/", {
 *   lite: false,
 * });
 * // → "/**\n * - `name` — The name\n *\/"
 * ```
 */
export const removeJsdocOnlyTags: Rule = {
  name: "remove-jsdoc-only-tags",
  summary:
    "Delete JSDoc-only tags (@typedef, @callback, @type) and resolve @property.",
  liteSafe: false,
  apply(comment, context) {
    const removable = new Set(context.removableProperties ?? []);
    const doomed = new Set<number>();
    const rewritten = new Map<number, string>();

    for (const tag of readPropertyTags(comment)) {
      for (let line = tag.line; line < tag.line + tag.lineCount; line += 1) {
        doomed.add(line);
      }
      if (!removable.has(tag.name) && tag.description !== "") {
        rewritten.set(tag.line, asListItem(tag.name, tag.description));
      }
    }

    return mapCommentLines(comment, (content, lineContext) => {
      if (lineContext.inFence) {
        return content;
      }
      const replacement = rewritten.get(lineContext.index);
      if (replacement !== undefined) {
        return replacement;
      }
      if (doomed.has(lineContext.index)) {
        return null;
      }
      const tag = leadingTag(content);
      if (tag && JSDOC_ONLY_TAGS.includes(tag)) {
        return null;
      }
      return content;
    });
  },
};
