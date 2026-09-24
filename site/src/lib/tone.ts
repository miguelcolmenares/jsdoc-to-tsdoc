// Tinted-pill color language shared by every badge on a docsite: a dot plus a 10% fill, 400 text
// and 20% border. Sites map their own categories onto these tones with createToneResolver, so the
// palette stays fixed while the taxonomy stays per-site.
export type BadgeTone = "blue" | "teal" | "amber" | "violet" | "rose" | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  teal: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  neutral: "bg-white/5 text-muted-foreground border-white/10",
};

const TONE_DOT: Record<BadgeTone, string> = {
  blue: "bg-blue-400",
  teal: "bg-teal-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  neutral: "bg-muted-foreground",
};

export function toneClasses(tone: BadgeTone): string {
  return TONE_CLASSES[tone];
}

export function toneDot(tone: BadgeTone): string {
  return TONE_DOT[tone];
}

/**
 * Builds a resolver that maps a site-specific category (a skill group, a tool domain, a tracker)
 * to a tone, falling back to `neutral` for anything unmapped or empty.
 */
export function createToneResolver(
  map: Readonly<Record<string, BadgeTone>>,
): (key: string | null | undefined) => BadgeTone {
  return (key) => (key ? (map[key] ?? "neutral") : "neutral");
}
