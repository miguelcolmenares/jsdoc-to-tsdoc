import { cn } from "@/lib/utils";

interface DetailLayoutProps {
  /** Group badge above the title, normally a ToneBadge. */
  badge?: React.ReactNode;
  title: string;
  description?: string;
  /** Sticky right column, normally a stack of MetaCards. Omit for a single column. */
  aside?: React.ReactNode;
  /** Article body, normally `<Markdown>` or a `SchemaTable`. */
  children: React.ReactNode;
  className?: string;
}

export function DetailLayout({ badge, title, description, aside, children, className }: DetailLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6",
        aside && "lg:grid-cols-[1fr_280px]",
        className,
      )}
    >
      <article className="min-w-0">
        {badge}
        <h1 className={cn("font-mono text-3xl font-semibold sm:text-4xl", badge && "mt-4")}>{title}</h1>
        {description && <p className="mt-3 text-lg text-muted-foreground">{description}</p>}
        <div className="mt-10 border-t border-white/10 pt-10">{children}</div>
      </article>
      {aside && <aside className="h-fit space-y-6 lg:sticky lg:top-24">{aside}</aside>}
    </div>
  );
}
