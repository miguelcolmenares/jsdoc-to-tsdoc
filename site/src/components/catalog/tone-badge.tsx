import { cn } from "@/lib/utils";
import { toneClasses, toneDot, type BadgeTone } from "@/lib/tone";

interface ToneBadgeProps {
  tone: BadgeTone;
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}

export function ToneBadge({ tone, children, className, mono }: ToneBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        mono && "font-mono",
        toneClasses(tone),
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", toneDot(tone))} />
      {children}
    </span>
  );
}
