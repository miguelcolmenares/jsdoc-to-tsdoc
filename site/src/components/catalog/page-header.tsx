import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, className }: PageHeaderProps) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{eyebrow}</span>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-3 text-muted-foreground">{description}</p>}
    </div>
  );
}
