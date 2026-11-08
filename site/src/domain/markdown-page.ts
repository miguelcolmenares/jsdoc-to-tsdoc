import { resolveLink } from "./links";
import type { LinkContext } from "./links";
import type { Document } from "./document";
import { proseLines, replaceInlineLinks, maskInlineCode, splitInlineCode } from "./markdown-scan";

/** What the Markdown copy of a page needs: the link rules of the page, and the address of the page itself. */
export interface MarkdownPageOptions {
  context: LinkContext;
  /** Origin of the published site, for example `https://user.github.io`. */
  origin: string;
  /** Absolute address of the page, so an in-page anchor can point at it from the copy. */
  pageUrl: string;
}

/** The address of a link target once the copy is read on its own: every site path gets the origin. */
function absolute(target: string, options: MarkdownPageOptions): string {
  if (target.startsWith("#")) return `${options.pageUrl}${target}`;
  if (target.startsWith("/") && !target.startsWith("//")) {
    return `${options.origin.replace(/\/+$/, "")}${target}`;
  }
  return target;
}

/** Rewrite the links of one piece of prose. Each link is decided by `resolveLink`, the rule the HTML uses. */
function rewriteProse(text: string, options: MarkdownPageOptions): string {
  return replaceInlineLinks(text, ({ image, label, href, title }, whole) => {
    if (image) return whole;
    const resolution = resolveLink(href, options.context);
    // A link to an excluded file keeps its words and loses the address, as it does on the page.
    if (resolution.kind === "text-only") return label;
    const target = resolution.kind === "missing" ? href : resolution.href;
    return `[${label}](${absolute(target, options)}${title})`;
  });
}

/**
 * The Markdown copy of a page: its title as a heading, and its body with every link decided by
 * the same rules as the HTML (routes, repository files, excluded files) and written as an absolute
 * address. Fenced code and inline code are never touched.
 */
export function renderMarkdownPage(document: Document, options: MarkdownPageOptions): string {
  const lines = proseLines(document.body).map(({ text, fenced }) => {
    if (fenced) return text;

    const masked = maskInlineCode(text);
    const markerStart = "__LINK_START__";
    const markerEnd = "__LINK_END__";
    
    const markers = replaceInlineLinks(masked, (link, whole) => {
      return `${markerStart}${whole}${markerEnd}`;
    });

    let result = "";
    let lastIdx = 0;
    let markerCount = 0;
    let searchIdx = 0;

    while (true) {
      const start = markers.indexOf(markerStart, searchIdx);
      if (start === -1) break;
      const end = markers.indexOf(markerEnd, start);
      if (end === -1) break;
      
      // Calculate position in the original text by subtracting marker lengths
      const actualStart = start - (markerCount * (markerStart.length + markerEnd.length));
      const linkLen = end - start - markerStart.length;
      const originalLink = text.slice(actualStart, actualStart + linkLen);
      
      result += text.slice(lastIdx, actualStart) + rewriteProse(originalLink, options);
      
      lastIdx = actualStart + linkLen;
      searchIdx = end + markerEnd.length;
      markerCount++;
    }
    result += text.slice(lastIdx);
    
    return result;
  });

  const body = lines.join("\n").replace(/^\s+/, "").trimEnd();
  return `${[`# ${document.title}`, body].filter((part) => part !== "").join("\n\n")}\n`;
}
