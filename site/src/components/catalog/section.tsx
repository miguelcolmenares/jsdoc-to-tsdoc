import { Container } from "@/components/catalog/container";
import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  /** `alt` adds the top rule and darker band used to alternate home sections. */
  variant?: "default" | "alt";
  className?: string;
}

export function Section({ children, variant = "default", className }: SectionProps) {
  if (variant === "alt") {
    return (
      <section className="border-t border-white/10 bg-black/20">
        <Container className={cn("py-24", className)}>{children}</Container>
      </section>
    );
  }
  return (
    <section>
      <Container className={cn("py-24", className)}>{children}</Container>
    </section>
  );
}
