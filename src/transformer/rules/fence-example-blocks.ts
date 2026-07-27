/**
 * Rule: wrap an `@example` body in a code fence when leaving it bare would
 * break TSDoc parsing.
 *
 * @since 0.1.0
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

/** Opens the fence this rule adds. TypeScript is the language it converts. */
const FENCE_OPEN = "```typescript";
/** Closes it. */
const FENCE_CLOSE = "```";

// Characters TSDoc reads as markup rather than as sample code. `{` starts what
// it takes for an inline tag and `}` closes one, `<` and `>` open and close
// HTML, and `@` anywhere — including inside a word, as in an email address —
// looks like a tag to it.
const NEEDS_FENCE = /[{}<>@]/;

// An inline code span already makes its content literal, so a `@param` or a
// `{ a: 1 }` written inside one parses cleanly and is no reason to fence. The
// span is removed before the test rather than excused after it, because a
// caption is prose about the example and fencing it would turn a sentence into
// code.
const CODE_SPAN = /`[^`]*`/g;

/** A block tag opening a line, which ends the preceding tag's body. */
const BLOCK_TAG = /^@[a-zA-Z]/;

/** One content line of a comment, as the planning pass sees it. */
interface ContentLine {
  readonly content: string;
  readonly inFence: boolean;
}

/** Where a fence has to be inserted, by content-line index. */
interface FencePlan {
  /** Indices a fence must open before. */
  readonly open: ReadonlySet<number>;
  /** Indices a fence must close after. */
  readonly close: ReadonlySet<number>;
}

/**
 * Reads a comment's content lines with the fence state of each.
 *
 * @param comment - The full `/** *\/` comment text.
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
 * Decides which `@example` bodies need a fence and where it goes.
 *
 * @remarks
 * A body runs from the line after the tag to the last line before the next
 * block tag, with blank lines at either end left outside the fence so the
 * comment keeps its spacing.
 *
 * Three bodies are passed over. One already inside a fence needs nothing. An
 * empty one has nothing to wrap. And one whose sample code contains none of the
 * characters TSDoc misreads is left exactly as written — fencing every example
 * would rewrite comments that were never broken, and the point is to fix a
 * parse error, not to impose a house style.
 *
 * @param lines - The comment's content lines.
 * @returns The indices to open a fence before and close one after.
 */
function planFences(lines: readonly ContentLine[]): FencePlan {
  const open = new Set<number>();
  const close = new Set<number>();

  for (const [index, line] of lines.entries()) {
    if (line.inFence || !/^@example\b/.test(line.content.trim())) {
      continue;
    }

    let first = index + 1;
    while (
      first < lines.length &&
      (lines[first]?.content.trim() ?? "") === ""
    ) {
      first += 1;
    }

    let last = first - 1;
    for (let scan = first; scan < lines.length; scan += 1) {
      const candidate = lines[scan];
      if (candidate === undefined || BLOCK_TAG.test(candidate.content.trim())) {
        break;
      }
      if (candidate.content.trim() !== "") {
        last = scan;
      }
    }

    if (last < first) {
      continue;
    }

    const body = lines
      .slice(first, last + 1)
      .map((entry) => entry.content)
      .join("\n");

    // A body holding a fence anywhere is left entirely alone, not just one that
    // opens with it. An `@example` may lead with a prose caption and fence only
    // the code below it — the shape this repo's own `buildStub` uses — and
    // wrapping that body would nest a fence inside a fence and turn the caption
    // into code. Where an author has already made fencing decisions, there is
    // nothing here to add.
    if (
      body.includes(FENCE_CLOSE) ||
      !NEEDS_FENCE.test(body.replace(CODE_SPAN, ""))
    ) {
      continue;
    }

    open.add(first);
    close.add(last);
  }

  return { open, close };
}

/**
 * Wraps an `@example` body in a `typescript` fence when TSDoc would otherwise
 * misparse it.
 *
 * @remarks
 * An unfenced example is the single largest source of TSDoc errors in real
 * code, and none of them are about the documentation being wrong: a `{` in
 * sample code is read as the start of an inline tag and its `}` as the end of
 * one, so `convert` output that looks perfectly good fails `check`. Fencing is
 * what a person migrating by hand writes, and it is what the rest of this
 * pipeline already expects — every other rule skips fenced lines, so an example
 * that is fenced is also an example no later rule can rewrite.
 *
 * The rule fences only what would break. Measured against the hand migration on
 * `osa-nextjs`, that reproduces the human's decision on 101 of 102 examples,
 * and the one difference is an example fenced that did not have to be. That
 * asymmetry is deliberate: a body left unfenced when it needed a fence is a
 * `check` failure, while one fenced without needing it is valid TSDoc that
 * renders sample code as sample code.
 *
 * @example
 * ```typescript
 * fenceExampleBlocks.apply("/**\n * @example\n * f({ a: 1 })\n *\/", {
 *   lite: false,
 * });
 * // → the body wrapped in ```typescript … ```
 * ```
 */
export const fenceExampleBlocks: Rule = {
  name: "fence-example-blocks",
  summary:
    "Wrap an @example body in a code fence when TSDoc would misparse it.",
  liteSafe: false,
  apply(comment) {
    const { open, close } = planFences(readContentLines(comment));
    if (open.size === 0) {
      return comment;
    }

    return mapCommentLines(comment, (content, context) => {
      const opens = open.has(context.index);
      const closes = close.has(context.index);
      if (!opens && !closes) {
        return content;
      }
      return [
        ...(opens ? [FENCE_OPEN] : []),
        content,
        ...(closes ? [FENCE_CLOSE] : []),
      ];
    });
  },
};
