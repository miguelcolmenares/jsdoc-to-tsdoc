import { CodeBlock } from "@/components/catalog/code-block";
import { Container } from "@/components/catalog/container";
import { StatRow, type Stat } from "@/components/catalog/stat-row";

interface HeroProps {
  /** Mono label above the title, usually `name@version`. */
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Copyable install command shown under the description. */
  command?: string;
  /** Buttons rendered under the command. */
  actions?: React.ReactNode;
  /** Extra content under the actions, such as a "works with" row. */
  children?: React.ReactNode;
  stats?: Stat[];
}

export function Hero({ eyebrow, title, description, command, actions, children, stats }: HeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
      <Container size="narrow" className="relative flex flex-col items-center py-24 text-center sm:py-32">
        {eyebrow && <span className="mb-6 font-mono text-xs text-muted-foreground">{eyebrow}</span>}
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">{title}</h1>
        {description && <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-balance">{description}</p>}
        {command && <CodeBlock command={command} className="mt-10 w-full max-w-lg" />}
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
        {children}
      </Container>
      {stats && stats.length > 0 && <StatRow stats={stats} className="relative" />}
    </section>
  );
}
