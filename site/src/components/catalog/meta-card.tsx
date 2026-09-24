import { cn } from "@/lib/utils";

interface MetaCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function MetaCard({ title, children, className }: MetaCardProps) {
  return (
    <div className={cn("rounded-xl border border-white/10 bg-card/60 p-4", className)}>
      <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </div>
  );
}
