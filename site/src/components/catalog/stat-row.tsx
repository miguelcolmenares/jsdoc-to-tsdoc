import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: string | number;
}

interface StatRowProps {
  stats: Stat[];
  className?: string;
}

// One column per stat from `sm` up. On mobile, up to three stats stay in one row and four or more
// wrap into two columns, so 2, 3 or 4 stats all read as a row of numbers.
export function StatRow({ stats, className }: StatRowProps) {
  const count = Math.max(stats.length, 1);
  const wraps = count > 3;
  return (
    <div
      style={
        {
          "--stat-cols": `repeat(${count}, minmax(0, 1fr))`,
          "--stat-cols-mobile": `repeat(${wraps ? 2 : count}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
      className={cn(
        "grid grid-cols-(--stat-cols-mobile) divide-x divide-white/10 border-t border-white/10 sm:grid-cols-(--stat-cols)",
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "flex flex-col items-center gap-1 border-white/10 px-2 py-8 text-center",
            wraps && "border-b sm:border-b-0",
          )}
        >
          <span className="font-mono text-3xl font-semibold">{stat.value}</span>
          <span className="text-xs text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
