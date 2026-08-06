/**
 * Rule: fold a dotted `@param parent.child` into its parent parameter.
 *
 * @remarks
 * JSDoc documents a destructured or nested property with a dotted path
 * (`@param params.endpoint`). TSDoc has no dotted-path form and rejects the name
 * as `tsdoc-param-tag-with-invalid-name`. Since the child's documentation exists
 * nowhere else, this does not drop it: each child is folded into the parent's
 * description as a `(child: description, …)` list, preserving every word. That
 * matches what the hand migration on `osa-nextjs` did for its small parameter
 * objects, and is lossless where the human chose brevity over completeness.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

// A `@param` line: the name token, then an optional `- description`. The name is
// a single non-space token so a dotted path (`params.endpoint`) is captured
// whole; the description runs to the end of the line.
const PARAM_LINE = /^@param\s+(\S+)(?:\s+-\s+(.*\S))?\s*$/;

// A dotted name: a parent segment (with optional JSDoc array-element syntax,
// `items[].foo`) and the child path after the first dot.
const DOTTED_NAME = /^([A-Za-z_$][\w$]*)(?:\[\])?\.(.+)$/;

/** One content line of a comment, with its fence state. */
interface ContentLine {
  readonly content: string;
  readonly inFence: boolean;
}

/**
 * A `@param` block: its parsed name and description together with the content
 * lines it occupies (its own line plus any wrapped continuation lines).
 */
interface ParamBlock {
  readonly name: string;
  /** The description, continuation lines joined with single spaces. */
  readonly description: string;
  /** The parent segment when the name is dotted, else `undefined`. */
  readonly parent: string | undefined;
  /** The child path after the parent segment when dotted, else `undefined`. */
  readonly child: string | undefined;
  /** The content-line index the `@param` opens on. */
  readonly startIndex: number;
  /** The last content-line index the block occupies (continuations included). */
  readonly endIndex: number;
}

/**
 * Reads a comment's content lines with the fence state of each.
 *
 * @param comment - The full comment text.
 * @returns One entry per content line, in order.
 */
function readContentLines(comment: string): readonly ContentLine[] {
  const lines: ContentLine[] = [];
  mapCommentLines(comment, (content, context) => {
    lines.push({ content, inFence: context.inFence });
    return content;
  });
  return lines;
}

/**
 * Parses every `@param` block in a comment, gathering each block's wrapped
 * continuation lines into a single description.
 *
 * @param lines - The comment's content lines.
 * @returns The `@param` blocks in source order.
 */
function readParamBlocks(lines: readonly ContentLine[]): readonly ParamBlock[] {
  const blocks: ParamBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.inFence) {
      continue;
    }
    const match = PARAM_LINE.exec(line.content.trim());
    if (match === null) {
      continue;
    }

    const [, name = "", description = ""] = match;
    const parts = [description];
    let endIndex = index;

    // Absorb wrapped continuation lines: a non-empty content line that neither
    // sits in a fence nor opens a new tag continues the description.
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      const next = lines[scan];
      if (next === undefined || next.inFence) {
        break;
      }
      const trimmed = next.content.trim();
      if (trimmed === "" || trimmed.startsWith("@")) {
        break;
      }
      parts.push(trimmed);
      endIndex = scan;
    }

    const dotted = DOTTED_NAME.exec(name);
    blocks.push({
      name,
      description: parts.filter((part) => part !== "").join(" "),
      parent: dotted?.[1],
      child: dotted?.[2],
      startIndex: index,
      endIndex,
    });
    index = endIndex;
  }

  return blocks;
}

/**
 * Renders one child as a `child: description` segment, or just `child` when the
 * child carries no description of its own.
 *
 * @param block - A dotted child block.
 * @returns The folded segment text.
 */
function foldSegment(block: ParamBlock): string {
  return block.description === ""
    ? (block.child ?? block.name)
    : `${block.child ?? block.name}: ${block.description}`;
}

/**
 * Appends a folded child list to a parent's last line, inserting the `-`
 * separator only when the parent has no description of its own.
 *
 * @remarks
 * The anchor is the parent's last line, which is the `@param` line itself only
 * when the description fits on one line; when it wraps, the anchor is a
 * continuation line that carries no `-` and needs none — the separator already
 * sits on the `@param` line above. So the decision keys off whether the parent
 * has a description at all, not off the text of the anchor line: a parent with
 * any description (single-line or wrapped) just gets the list appended, and only
 * a bare `@param name` with nothing after it gains the ` - ` separator.
 *
 * @param anchorContent - The parent's last line content (its ` * ` prefix
 * already removed).
 * @param list - The rendered `(child: …, …)` list.
 * @param hasDescription - Whether the parent carries any description.
 * @returns The rewritten anchor line content.
 */
function appendList(
  anchorContent: string,
  list: string,
  hasDescription: boolean,
): string {
  const trimmed = anchorContent.trim();
  return hasDescription ? `${trimmed} ${list}` : `${trimmed} - ${list}`;
}

/** A fold plan's rewrites: line replacements and line drops. */
interface FoldPlan {
  readonly replace: ReadonlyMap<number, string>;
  readonly drop: ReadonlySet<number>;
}

/**
 * Plans the fold: for every parent that has dotted children, which line to
 * rewrite and which child lines to drop.
 *
 * @remarks
 * A parent's own `@param` line is the anchor the list is appended to. When a
 * comment documents children but never the parent itself, the first child's
 * line is promoted to the parent line so no documentation is lost.
 *
 * @param blocks - The comment's `@param` blocks.
 * @param lines - The comment's content lines, for the raw parent-line text.
 * @returns The planned replacements and drops, keyed by content-line index.
 */
function planFold(
  blocks: readonly ParamBlock[],
  lines: readonly ContentLine[],
): FoldPlan {
  const replace = new Map<number, string>();
  const drop = new Set<number>();

  const childrenByParent = new Map<string, ParamBlock[]>();
  for (const block of blocks) {
    if (block.parent === undefined) {
      continue;
    }
    const group = childrenByParent.get(block.parent) ?? [];
    group.push(block);
    childrenByParent.set(block.parent, group);
  }

  for (const [parent, children] of childrenByParent) {
    const list = `(${children.map(foldSegment).join(", ")})`;
    const parentBlock = blocks.find(
      (block) => block.parent === undefined && block.name === parent,
    );

    if (parentBlock === undefined) {
      // No parent line: promote the first child's line to carry the list, and
      // drop the rest of that child along with every other child.
      const [first, ...rest] = children;
      if (first === undefined) {
        continue;
      }
      replace.set(first.startIndex, `@param ${parent} - ${list}`);
      for (let line = first.startIndex + 1; line <= first.endIndex; line += 1) {
        drop.add(line);
      }
      for (const child of rest) {
        for (let line = child.startIndex; line <= child.endIndex; line += 1) {
          drop.add(line);
        }
      }
      continue;
    }

    const lastLine =
      lines[parentBlock.endIndex]?.content.trim() ??
      `@param ${parentBlock.name}`;
    replace.set(
      parentBlock.endIndex,
      appendList(lastLine, list, parentBlock.description !== ""),
    );
    for (const child of children) {
      for (let line = child.startIndex; line <= child.endIndex; line += 1) {
        drop.add(line);
      }
    }
  }

  return { replace, drop };
}

/**
 * Folds dotted `@param parent.child` tags into their parent's description.
 *
 * @remarks
 * TSDoc rejects a dotted parameter path outright, so a converted comment that
 * reads perfectly fails `check`. Rather than drop the child documentation, each
 * child is folded into the parent as a `(child: description, …)` list — lossless
 * where the child carried a description, and matching the hand migration's
 * decision for small parameter objects.
 *
 * @example
 * ```typescript
 * foldDottedParam.apply(
 *   "/**\n * @param p - Opts\n * @param p.a - First\n *\/",
 *   { lite: false },
 * );
 * // → "/** @param p - Opts (a: First) *\/"
 * ```
 */
export const foldDottedParam: Rule = {
  name: "fold-dotted-param",
  summary: "Fold a dotted @param parent.child into its parent parameter.",
  liteSafe: false,
  apply(comment) {
    const lines = readContentLines(comment);
    const { replace, drop } = planFold(readParamBlocks(lines), lines);
    if (replace.size === 0 && drop.size === 0) {
      return comment;
    }

    return mapCommentLines(comment, (content, context) => {
      const replacement = replace.get(context.index);
      if (replacement !== undefined) {
        return replacement;
      }
      if (drop.has(context.index)) {
        return null;
      }
      return content;
    });
  },
};
