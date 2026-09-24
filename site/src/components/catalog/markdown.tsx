import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { CodeHighlight } from "@/components/catalog/code-highlight";
import { cn } from "@/lib/utils";

// The source templates are our own trusted content (not user input), so parsing embedded
// raw HTML — including the `<!-- -->` review-note comments some skills carry — is safe.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-a:text-accent-blue prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-white/20 prose-blockquote:text-muted-foreground prose-strong:text-foreground prose-hr:border-white/10 prose-table:text-sm prose-th:text-left">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
        components={{
          // Fenced blocks own their full presentation below — no double <pre>.
          pre: ({ children }) => <>{children}</>,
          // A markdown table's columns don't shrink below their content's natural
          // width — without a scrolling container, a wide table pushes the whole
          // page wider at narrow viewports instead of scrolling internally.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
          code: ({ className, children }) => {
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            if (!language) {
              // Unlike fenced blocks (their own overflow-x-auto container below),
              // an inline code span sits directly in flowing prose text — an
              // unbroken file path or glob with no spaces won't wrap on its own
              // and pushes the whole page wider at narrow viewports.
              return <code className={cn(className, "wrap-break-word")}>{children}</code>;
            }
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 text-sm">
                <CodeHighlight language={language}>{String(children)}</CodeHighlight>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
