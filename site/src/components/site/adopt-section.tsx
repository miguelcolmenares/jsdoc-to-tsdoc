import { ArrowRight, Eye, FileCheck2, ShieldCheck, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/catalog/code-block";
import { Section } from "@/components/catalog/section";
import { SectionHeading } from "@/components/catalog/section-heading";
import { Button } from "@/components/ui/button";

interface Reason {
  icon: LucideIcon;
  title: string;
  body: string;
}

// The claims are the ones the docs demonstrate with real runs. Numbers come from the sample project
// in the "Migrate a JSDoc codebase to TSDoc" tutorial.
const REASONS: Reason[] = [
  {
    icon: Terminal,
    title: "Nothing to install",
    body: "Run it with npx, yarn dlx or pnpm dlx. It never enters your package.json, your lockfile or your audit.",
  },
  {
    icon: Eye,
    title: "Look before you change anything",
    body: "scan and check never write, and every command that does has --dry-run. Read the diff, then apply it.",
  },
  {
    icon: FileCheck2,
    title: "Your sentences stay yours",
    body: "It rewrites syntax, not prose. No language model, so the same input gives the same output, and @property descriptions move onto their members instead of being deleted.",
  },
  {
    icon: ShieldCheck,
    title: "A gate that keeps it done",
    body: "check runs the official TSDoc parser in CI, and escalate turns missing documentation into a build failure.",
  },
];

const TRY = [
  "npx jsdoc-to-tsdoc scan --classify",
  "npx jsdoc-to-tsdoc convert --dry-run",
  "npx jsdoc-to-tsdoc check",
];

export function AdoptSection() {
  return (
    <Section variant="alt">
      <SectionHeading
        index="→"
        label="Why use it"
        title="From 36 problems to none"
        description="On the sample project of the tutorial, check starts at 36 problems across 4 files and ends clean after convert and scaffold. Most of the work is comments nobody had written yet, and that is the part the tool does for you."
      />

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-white/10 bg-card/60 p-6">
            <Icon className="size-5 text-accent-blue" />
            <h3 className="mt-4 font-mono text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-white/10 bg-black/30 p-6 sm:p-8">
        <h3 className="text-lg font-semibold">Try it on your project in a minute</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          These three commands only read. They tell you where you stand and what a conversion would change, and they
          leave your files as they are.
        </p>
        <div className="mt-5 grid gap-3">
          {TRY.map((command) => (
            <CodeBlock key={command} command={command} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/tutorials/migrate-jsdoc-to-tsdoc">
              Follow the tutorial <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/docs/getting-started">Read Getting started</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
