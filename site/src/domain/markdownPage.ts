import { resolveLink } from "./links";
import type { LinkContext } from "./links";
import type { Document } from "./document";
import { proseLines, replaceInlineLinks, maskInlineCode, splitInlineCode } from "./markdownScan";

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

    // We want to rewrite links but skip those inside code spans.
    // We use a masked version of the text to find links that are NOT in code spans.
    const masked = maskInlineCode(text);
    
    // We can't use replaceInlineLinks directly because it replaces the text.
    // Instead, we use the masked text to find valid links and their boundaries.
    // Since scanInlineLinks isn't exported, we'll use replaceInlineLinks on the masked text
    // with a replacement that marks the boundaries.
    
    const markers = replaceInlineLinks(masked, (link, whole) => {
      return `__LINK_START__${whole}__LINK_END__`;
    });

    // Now we apply the same markers to the original text.
    // Since the length of the masked text is identical to the original, 
    // we can find the positions of the markers.
    
    let result = "";
    let lastIdx = 0;
    const markerStart = "__LINK_START__";
    const markerEnd = "__LINK_END__";
    
    let searchIdx = 0;
    while (true) {
      const start = markers.indexOf(markerStart, searchIdx);
      if (start === -1) break;
      const end = markers.indexOf(markerEnd, start);
      if (end === -1) break;
      
      // The original text between start and end + markerEnd.length is the link.
      const linkText = text.slice(start, end + markerEnd.length - markerEnd.length); // wait, markers are added
      // Actually, the 'whole' inside the marker in 'markers' is the link from 'masked'.
      // We need the 'whole' from the original text.
      
      // The markerStart is at 'start'. The markerEnd is at 'end'.
      // The length of the link in masked text is (end - start - markerStart.length).
      const linkLen = end - start - markerStart.length;
      const originalLink = text.slice(start, start + linkLen);
      
      result += text.slice(lastIdx, start) + rewriteProse(originalLink, options);
      
      lastIdx = start + linkLen;
      searchIdx = end + markerEnd.length;
    }
    result += text.slice(lastIdx);
    
    return result;
  });

  const body = lines.join("\n").replace(/^\s+/, "").trimEnd();
  return `${[`# ${document.title}`, body].filter((part) => part !== "").join("\n\n")}\n`;
}
