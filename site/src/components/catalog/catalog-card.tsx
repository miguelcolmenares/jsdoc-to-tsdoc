import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CatalogCardProps {
  to: string;
  title: string;
  description?: string;
  /** Top-left slot, normally a ToneBadge for the item's group. */
  badge?: React.ReactNode;
  /** Top-right slot for a secondary tag or mono metadata. */
  meta?: React.ReactNode;
  /** Footer link text, for example "View skill". */
  cta: string;
  /** Use for titles that may be long unbroken identifiers such as `ccds_get_top_communities`. Words only break when they do not fit. */
  breakTitle?: boolean;
  className?: string;
}

export function CatalogCard({ to, title, description, badge, meta, cta, breakTitle, className }: CatalogCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-col justify-between rounded-xl border border-white/10 bg-card/60 p-5 transition hover:border-white/20 hover:bg-card",
        className,
      )}
    >
      <div>
        {(badge || meta) && (
          <div className="flex items-center justify-between gap-2">
            {badge}
            {meta}
          </div>
        )}
        <h3 className={cn("mt-4 font-mono text-base font-medium", breakTitle && "text-sm wrap-break-word")}>{title}</h3>
        {description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="mt-6 flex items-center justify-end border-t border-white/10 pt-3 text-sm text-muted-foreground transition group-hover:text-foreground">
        <span className="inline-flex items-center gap-1">
          {cta}
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
