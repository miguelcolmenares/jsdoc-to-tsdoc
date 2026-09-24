import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

interface SiteShellProps {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

export function SiteShell({ header, footer, children }: SiteShellProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="bg-grid flex min-h-screen flex-col">
        {header}
        <main className="flex-1">{children}</main>
        {footer}
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
