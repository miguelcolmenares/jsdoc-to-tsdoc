import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  /** `default` is the 6xl content column, `narrow` is the 4xl hero and prose column. */
  size?: "default" | "narrow";
  className?: string;
}

export function Container({ children, size = "default", className }: ContainerProps) {
  return (
    <div className={cn("mx-auto px-4 sm:px-6", size === "narrow" ? "max-w-4xl" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}
