/**
 * Lightweight structural inspection of a `/** *\/` comment.
 *
 * @remarks
 * These helpers answer coarse questions about a comment — which tags it
 * contains, which parameters and type parameters it documents by name, whether
 * it carries type-brace annotations — without a full AST. They power
 * classification in `scan` and the "will this change?" preview in `convert`.
 * Deeper structural editing is the transformer pipeline's job.
 *
 * {@link readPropertyTags} goes one step further and returns each tag's prose
 * with the lines it occupies, because relocating a `@property` needs both, and
 * having the reader and the rewriter derive the span separately is how the two
 * would come to disagree.
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
//
// Matched anywhere a tag can begin — the comment's own start or after
// whitespace — not only at the start of a line. A single-line comment carries
// its whole body on one line (`/** Adds. @param a - … @param b - … *\/`), and
// the official parser reads every tag in it, so anchoring to the line start
// silently found none of them.
const PARAM_NAME =
  /(?:^|\s)@(?:param|arg|argument)\s+(?:\{[^}]*\}\s*)?\[?\s*(?:\.\.\.)?([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g;
const TYPE_PARAM_NAME =
  /(?:^|\s)@(?:typeParam|template)\s+([A-Za-z_$][\w$]*)/g;
const ANY_TAG = /(?:^|\s)(@[a-zA-Z]+)/g;

/**
 * Collects the names a comment documents with a given tag family.
 *
 * @param comment - The full `/** *\/` comment text.
 * @param pattern - Global pattern whose first capture group is the documented
 * name.
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
    pattern.lastIndex = 0;
    let match = pattern.exec(content);
    while (match !== null) {
      const name = match[1];
      if (name !== undefined) {
        names.push(name);
      }
      match = pattern.exec(content);
    }
    return content;
  });
  return names;
}

/**
 * Collects every block tag a comment carries, wherever it sits on its line.
 *
 * @remarks
 * {@link getBlockTags} reports only the tag that *opens* a line, which is what
 * the conversion rules need: they rewrite a line by its leading tag. Asking
 * whether a comment documents something at all is a different question, and on
 * a single-line comment every tag but the first opens no line of its own.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns Lowercased tag tokens, deduplicated.
 */
export function getCommentTags(comment: string): readonly string[] {
  const seen = new Set<string>();
  mapCommentLines(comment, (content, context) => {
    if (context.inFence) {
      return content;
    }
    ANY_TAG.lastIndex = 0;
    let match = ANY_TAG.exec(content);
    while (match !== null) {
      const tag = match[1];
      if (tag !== undefined) {
        seen.add(tag.toLowerCase());
      }
      match = ANY_TAG.exec(content);
    }
    return content;
  });
  return [...seen];
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

// Any `@property` tag that opens its line: the tag, an optional `{type}`, an
// optional name token, and the rest as the description.
//
// The name is captured as a whole token rather than matched against an
// identifier pattern. JSDoc permits shapes TypeScript identifiers do not —
// `[optional]`, `[withDefault=1]`, `['quoted-key']` — and a name pattern that
// rejected one of them would make the tag invisible here, which is the one
// outcome that loses its description. Being generous costs a name that is
// merely odd; being strict costs the prose.
// The lookahead keeps a lone `-` out of the name: with no name at all
// (`@property - Some prose`), the separator is the next token and would
// otherwise be read as the member's name.
const PROPERTY_LINE =
  /^@(?:property|prop)\b[ \t]*(?:\{[^}]*\}[ \t]*)?(\[[^\]]*\]|(?!-(?:[ \t]|$))\S+)?[ \t]*(?:-[ \t]*)?(.*)$/;

/**
 * Reduces a JSDoc name token to the member name it refers to.
 *
 * @param token - The raw token as written after the tag.
 * @returns The bare name, with optional brackets, a default value, and
 * surrounding quotes removed.
 */
function memberName(token: string): string {
  const unbracketed = /^\[(.*)\]$/.exec(token)?.[1] ?? token;
  const [beforeDefault = ""] = unbracketed.split("=");
  return beforeDefault.trim().replace(/^["'`]|["'`]$/g, "");
}

/**
 * A `@property` tag together with the content lines it occupies.
 */
export interface PropertyTag {
  /**
   * The member name the tag documents, normalized from the JSDoc spelling.
   *
   * @remarks
   * Empty when the tag names nothing at all. Such a tag is still reported
   * rather than skipped: it may carry a description, and a description this
   * reader does not return is one the removal rule cannot know to preserve.
   */
  readonly name: string;
  /** The description, with any continuation lines folded into one. */
  readonly description: string;
  /** Zero-based index of the content line the tag opens. */
  readonly line: number;
  /** How many content lines the tag spans, continuations included. */
  readonly lineCount: number;
}

/**
 * Reads the `@property` tags a comment carries, with the span each one occupies.
 *
 * @remarks
 * `@property` is the one JSDoc-only tag that carries prose nobody else has: it
 * describes an interface member, and TypeScript's own syntax has no place to put
 * that description except a doc comment on the member itself. Deleting the tag
 * is therefore only safe once the description exists somewhere else, so the
 * caller needs the description and the exact lines to remove — derived here,
 * once, rather than re-derived by whoever removes them.
 *
 * Every tag that *opens* its line is reported, whatever it names — including
 * one that names nothing. The reader is the removal rule's only account of
 * where `@property` prose lives, so a tag missing from this list is a tag the
 * rule cannot know to preserve.
 *
 * A `@property` sitting mid-line is the one exception. It has no unambiguous
 * end, so folding a description out of it would be a guess, and a wrong guess
 * here destroys the prose the move exists to rescue; the rule leaves such a
 * line alone instead.
 *
 * A continuation line — one that follows a tag and starts neither a new tag nor
 * a blank — belongs to that tag's description and is folded into it.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns One entry per line-leading `@property` tag, in source order.
 *
 * @example
 * ```typescript
 * readPropertyTags("/**\n * @property id - The id.\n *\/");
 * // → [{ name: "id", description: "The id.", line: 1, lineCount: 1 }]
 * ```
 */
export function readPropertyTags(comment: string): readonly PropertyTag[] {
  const tags: PropertyTag[] = [];
  let open: { name: string; parts: string[]; line: number; end: number } | null =
    null;

  const close = (): void => {
    if (open === null) {
      return;
    }
    tags.push({
      name: open.name,
      description: open.parts.join(" ").trim(),
      line: open.line,
      lineCount: open.end - open.line + 1,
    });
    open = null;
  };

  mapCommentLines(comment, (content, context) => {
    if (context.inFence) {
      close();
      return content;
    }

    const trimmed = content.trim();
    const match = PROPERTY_LINE.exec(trimmed);
    if (match) {
      close();
      const [, token = "", description = ""] = match;
      open = {
        name: memberName(token),
        parts: description.trim() === "" ? [] : [description.trim()],
        line: context.index,
        end: context.index,
      };
      return content;
    }

    if (open !== null && trimmed !== "" && !trimmed.startsWith("@")) {
      open.parts.push(trimmed);
      open.end = context.index;
      return content;
    }

    close();
    return content;
  });

  close();
  return tags;
}
