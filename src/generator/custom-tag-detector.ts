/**
 * Detection and classification of the block tags a project actually uses.
 *
 * @remarks
 * `init` needs to know which tags appear so it can register the custom ones
 * (`@since`, `@author`, …) in `tsdoc.json` and leave the standard ones alone.
 * The pure {@link aggregateCommentTags} does the counting and classifying;
 * {@link collectProjectTags} wires it to the filesystem via the scanner.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";

import { leadingTag, mapCommentLines } from "@/parser";
import { extractJsDocComments, findSourceFiles } from "@/scanner";
import { classifyTag, type TagClassification } from "@/generator/tsdoc-tags";

/**
 * How often a single tag appears across the scanned comments, and how it relates
 * to the TSDoc standard.
 */
export interface TagUsage {
  /** The tag token, lowercased and including its `@` (for example `@since`). */
  readonly tag: string;
  /** Number of occurrences across all scanned comments. */
  readonly count: number;
  /** Whether the tag is standard, a known custom, or unknown. */
  readonly classification: TagClassification;
}

/**
 * The outcome of classifying every block tag in a project.
 */
export interface CustomTagReport {
  /** Per-tag usage, sorted by descending count then tag name. */
  readonly usages: readonly TagUsage[];
  /** Custom block tags that should be registered in `tsdoc.json`. */
  readonly blockTagsToRegister: readonly string[];
  /** Tags that are neither standard nor known — a human must decide their fate. */
  readonly unknownTags: readonly string[];
}

/**
 * Collects the leading block tags of a single comment, one entry per tag line.
 *
 * @param comment - The full `/** *\/` comment text.
 * @returns The lowercased tag tokens in source order (duplicates preserved).
 */
function commentTags(comment: string): readonly string[] {
  const tags: string[] = [];
  mapCommentLines(comment, (content, context) => {
    if (!context.inFence) {
      const tag = leadingTag(content);
      if (tag) {
        tags.push(tag);
      }
    }
    return content;
  });
  return tags;
}

/**
 * Counts and classifies the block tags found across a set of comments.
 *
 * @param comments - The raw comment texts to inspect.
 * @returns A {@link CustomTagReport} summarizing tag usage and what to register.
 */
export function aggregateCommentTags(
  comments: Iterable<string>,
): CustomTagReport {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    for (const tag of commentTags(comment)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const usages: TagUsage[] = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count, classification: classifyTag(tag) }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const blockTagsToRegister = usages
    .filter((usage) => usage.classification === "custom")
    .map((usage) => usage.tag);

  const unknownTags = usages
    .filter((usage) => usage.classification === "unknown")
    .map((usage) => usage.tag);

  return { usages, blockTagsToRegister, unknownTags };
}

/**
 * Scans a project's source files and classifies every block tag they use.
 *
 * @param root - The absolute project root to scan.
 * @returns A {@link CustomTagReport} aggregated across all discovered files.
 */
export async function collectProjectTags(
  root: string,
): Promise<CustomTagReport> {
  const files = await findSourceFiles(root);
  const comments: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const comment of extractJsDocComments(source, file)) {
      comments.push(comment.text);
    }
  }
  return aggregateCommentTags(comments);
}
