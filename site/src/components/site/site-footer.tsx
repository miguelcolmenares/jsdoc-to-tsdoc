import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/catalog/code-block";
import type { NavItem } from "@/components/site/site-header";

export interface FooterColumn {
  title: string;
  links: NavItem[];
}

interface SiteFooterProps {
  name: string;
  icon: LucideIcon;
  description?: string | undefined;
  /** Package name and version, shown bottom-left. */
  version?: string | undefined;
  /** Copyable install command under the description. */
  installCommand?: string | undefined;
  columns: FooterColumn[];
  repository?: string | undefined;
}

export function SiteFooter({
  name,
  icon: Icon,
  description,
  version,
  installCommand,
  columns,
  repository,
}: SiteFooterProps) {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div
          style={
            {
              // Brand block twice as wide as each link column; a lone brand block when there are none.
              "--footer-cols":
                columns.length > 0 ? `2fr repeat(${columns.length}, minmax(0, 1fr))` : "1fr",
            } as React.CSSProperties
          }
          className="grid grid-cols-1 gap-10 sm:grid-cols-(--footer-cols)"
        >
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Icon className="size-5 text-accent-blue" />
              {name}
            </div>
            {description && <p className="mt-3 max-w-sm text-sm text-muted-foreground">{description}</p>}
            {installCommand && <CodeBlock command={installCommand} className="mt-4 max-w-sm" />}
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{column.title}</h4>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={`${link.to}:${link.label}`}>
                    <Link to={link.to} className="text-muted-foreground transition hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{version ?? name}</span>
          {repository && (
            <a href={repository} target="_blank" rel="noreferrer" className="hover:text-foreground">
              {repository.replace("https://", "")}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
