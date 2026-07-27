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

// `@param` and its JSDoc aliases, then an optional `{type}`, then the name —
// which may be wrapped in JSDoc optional brackets, carry a default value, or use
// dot notation for a member of an object parameter.
const PARAM_NAME =
  /^@(?:param|arg|argument)\s+(?:\{[^}]*\}\s*)?\[?\s*(?:\.\.\.)?([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/;
const TYPE_PARAM_NAME = /^@(?:typeParam|template)\s+([A-Za-z_$][\w$]*)/;

/**
 * Collects the names a comment documents with a given tag family.
 *
 * @param comment - The full `/** *\/` comment text.
 * @param pattern - Pattern whose first capture group is the documented name.
 * @returns The names in source order, including any duplicates.
 */
function documentedNames(
  comment: string,
  pattern: RegExp,
): readonly string[] {
  const names: string[] = [];
  mapCommentLines(comment, (content, context) => {
    if (context.inFence) {
      return content;
    }
    const name = pattern.exec(content.trim())?.[1];
    if (name !== undefined) {
      names.push(name);
    }
    return content;
  });
  return names;
}

/**
 * Collects the parameter names a comment documents.
 *
 * @remarks
 * Accepts the shapes real JSDoc uses, not only valid TSDoc, because the point
 * is to compare documentation against a signature *before* conversion has
 * tidied it: `@arg`, a leading `{type}`, optional brackets with a default, a
 * rest prefix, and `options.name` dot notation all yield the documented name.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns The documented names in source order, duplicates included.
 *
 * @example
 * ```typescript
 * getDocumentedParams("/**\n * @param {string} [id=1] - The id.\n *\/");
 * // → ["id"]
 * ```
 */
export function getDocumentedParams(comment: string): readonly string[] {
  return documentedNames(comment, PARAM_NAME);
}

/**
 * Collects the type-parameter names a comment documents.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns The documented names in source order, accepting both the TSDoc
 * `@typeParam` and the JSDoc `@template` spelling.
 */
export function getDocumentedTypeParams(comment: string): readonly string[] {
  return documentedNames(comment, TYPE_PARAM_NAME);
}
