import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  command: string;
  className?: string;
  prompt?: string;
}

export function CodeBlock({ command, className, prompt = "$" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing to fall back to in a static site
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm",
        className,
      )}
    >
      <span className="text-accent-blue select-none">{prompt}</span>
      <code className="flex-1 overflow-x-auto whitespace-pre text-foreground/90">{command}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy command"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
      >
        {copied ? <Check className="size-4 text-teal-400" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
