import { Menu, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { GitHubIcon } from "@/components/site/github-icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
}

interface SiteHeaderProps {
  /** Project name shown next to the logo icon and as the mobile sheet title. */
  name: string;
  icon: LucideIcon;
  links: NavItem[];
  /** Repository URL. Renders the GitHub button and the mobile "Repository" link when set. */
  repository?: string | undefined;
  /** Desktop search slot, normally a `<CommandMenu />`. */
  search?: React.ReactNode;
}

export function SiteHeader({ name, icon: Icon, links, repository, search }: SiteHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <NavLink to="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <Icon className="size-5 text-accent-blue" />
          <span>{name}</span>
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground",
                  isActive && "bg-white/5 text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          {search && <div className="hidden lg:block">{search}</div>}
          {repository && (
            <Button variant="ghost" size="icon" asChild>
              <a href={repository} target="_blank" rel="noreferrer" aria-label="Repository">
                <GitHubIcon className="size-4" />
              </a>
            </Button>
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>{name}</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground",
                      isActive && "bg-white/5 text-foreground",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              {repository && (
                <a
                  href={repository}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Repository
                </a>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
