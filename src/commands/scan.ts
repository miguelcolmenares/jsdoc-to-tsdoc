/**
 * @packageDocumentation
 * `scan` subcommand — read-only analysis of a project's documentation, in two
 * modes. By default it inventories what `convert` would change; with
 * `--classify` it reports how well each export is documented, how far that can
 * be trusted, and the next action per file. `--fail-on-missing` and
 * `--fail-on-stale` turn the second mode into a CI gate that exits `3`.
 * `--enrich=copilot|ollama|anthropic` asks an LLM provider to suggest
 * documentation for the LOW-confidence and STALE cases classification finds —
 * opt-in only, and gated so that omitting the flag never imports, constructs,
 * or calls into the `enricher` domain at all.
 *
 * Neither mode ever writes.
 *
 * @since 0.1.0
 */

import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineCommand } from "citty";

import { classifyFile, type DeclarationClassification } from "@/classifier";
import {
  actionLines,
  confidenceLine,
  enrichmentFindings,
  missingCount,
  staleCount,
  staleFindings,
  summarizeClassification,
  topologyRows,
  type ClassifiedFile,
  type ClassifySummary,
  type EnrichmentFinding,
} from "@/commands/classify-report";
import { convertSourceText } from "@/commands/convert-file";
import { reportCommandFailure } from "@/commands/command-failure";
import {
  parseEnrichProvider,
  parseReportFormat,
  splitGlobs,
} from "@/commands/options";
import {
  createEnrichmentProvider,
  enrichTargets,
  selectEnrichmentTargets,
  type EnrichmentOutcome,
  type EnrichProviderName,
} from "@/enricher";
import { TEST_FILE_GLOBS } from "@/generator";
import {
  createColors,
  formatTable,
  shouldUseColor,
  toJsonReport,
  toMarkdownTable,
  type Colors,
  type SummaryRow,
} from "@/reporter";
import {
  collectExportedDeclarations,
  extractJsDocComments,
  findSourceFiles,
} from "@/scanner";

interface ScanTotals {
  readonly filesScanned: number;
  readonly filesWithJsDoc: number;
  readonly commentsTotal: number;
  readonly commentsToConvert: number;
  readonly filesToChange: number;
}

/**
 * The `scan` command definition.
 */
export default defineCommand({
  meta: {
    name: "scan",
    description: "Inventory the JSDoc that convert would touch (no writes).",
  },
  args: {
    cwd: {
      type: "string",
      description: "Project directory to scan.",
      default: ".",
    },
    lite: {
      type: "boolean",
      description: "Count only @param/@returns hygiene changes.",
    },
    only: {
      type: "string",
      description: "Comma-separated globs to include.",
    },
    exclude: {
      type: "string",
      description: "Comma-separated globs to exclude.",
    },
    report: {
      type: "string",
      description: "Machine-readable output: json | md.",
    },
    classify: {
      type: "boolean",
      description:
        "Report documentation topology and confidence instead of the conversion inventory.",
    },
    "fail-on-missing": {
      type: "boolean",
      description:
        "Exit 3 when any export has no TSDoc comment (implies --classify).",
    },
    "fail-on-stale": {
      type: "boolean",
      description:
        "Exit 3 when any comment contradicts its signature (implies --classify).",
    },
    "include-tests": {
      type: "boolean",
      description:
        "Classify test files too, which `init` exempts from the TSDoc rules.",
    },
    enrich: {
      type: "string",
      description:
        "Ask an LLM to suggest documentation for LOW-confidence and STALE " +
        "exports (implies --classify): copilot | ollama | anthropic. " +
        "Opt-in — omitting this flag never calls a provider.",
    },
  },
  async run({ args }) {
    try {
      const cwd = resolve(String(args.cwd ?? "."));
      const lite = Boolean(args.lite);
      const reportFormat = parseReportFormat(args.report);
      const failOnMissing = Boolean(args["fail-on-missing"]);
      const failOnStale = Boolean(args["fail-on-stale"]);

      // `args.enrich` is `undefined` when the flag was not passed at all —
      // that case must never reach `enricher`, and is kept apart from "passed
      // with an unrecognized value", which is reported rather than silently
      // running with no enrichment.
      const enrichRequested = args.enrich !== undefined;
      const enrichProvider = enrichRequested
        ? parseEnrichProvider(args.enrich)
        : undefined;
      if (enrichRequested && enrichProvider === undefined) {
        process.stderr.write(
          `scan: unknown --enrich ${JSON.stringify(args.enrich)} — expected "copilot", "ollama", or "anthropic".\n`,
        );
        process.exitCode = 1;
        return;
      }

      // The gates read a classification, so asking for one implies producing
      // it — `--enrich` is one more such gate: it has nothing to enrich
      // without a classification to read LOW-confidence/STALE cases from.
      const classify =
        Boolean(args.classify) ||
        failOnMissing ||
        failOnStale ||
        enrichProvider !== undefined;

      // Classification judges how well exports are documented, and the ESLint
      // config `init` writes turns both TSDoc rules off for test paths — so
      // reporting them would be reporting work the tool's own scaffolding
      // excuses. The default inventory keeps them, because `convert` does
      // rewrite JSDoc in tests.
      const excludeTests =
        classify && !args["include-tests"] ? TEST_FILE_GLOBS : [];

      // `--lite` narrows the conversion inventory, which `--classify` does not
      // produce. Dropping it without a word would let a CI job read the numbers
      // as the narrower set it asked for.
      if (classify && lite) {
        process.stderr.write(
          "scan: --lite narrows the conversion inventory and has no effect with --classify.\n",
        );
      }

      const files = await findSourceFiles(cwd, {
        only: splitGlobs(args.only),
        exclude: [...splitGlobs(args.exclude), ...excludeTests],
      });

      if (classify) {
        await runClassify({
          cwd,
          files,
          reportFormat,
          failOnMissing,
          failOnStale,
          enrichProvider,
        });
        return;
      }

      let filesWithJsDoc = 0;
      let commentsTotal = 0;
      let commentsToConvert = 0;
      let filesToChange = 0;

      for (const file of files) {
        const source = await readFile(file, "utf8");
        const comments = extractJsDocComments(source, file);
        if (comments.length > 0) {
          filesWithJsDoc += 1;
        }
        commentsTotal += comments.length;

        const conversion = convertSourceText(source, file, { lite });
        commentsToConvert += conversion.commentsChanged;
        if (conversion.changed) {
          filesToChange += 1;
        }
      }

      const totals: ScanTotals = {
        filesScanned: files.length,
        filesWithJsDoc,
        commentsTotal,
        commentsToConvert,
        filesToChange,
      };

      const rows: SummaryRow[] = [
        { label: "Files scanned", value: totals.filesScanned },
        { label: "Files with JSDoc", value: totals.filesWithJsDoc },
        { label: "Comments total", value: totals.commentsTotal },
        { label: "Comments to convert", value: totals.commentsToConvert },
        { label: "Files to change", value: totals.filesToChange },
      ];

      if (reportFormat === "json") {
        process.stdout.write(
          `${toJsonReport({ command: "scan", ...totals })}\n`,
        );
        return;
      }
      if (reportFormat === "md") {
        process.stdout.write(`${toMarkdownTable("Category", rows)}\n`);
        return;
      }

      const colors = createColors(
        shouldUseColor(Boolean(process.stdout.isTTY)),
      );
      process.stdout.write(`${formatTable(rows, colors)}\n`);
      if (totals.filesToChange > 0) {
        process.stdout.write(
          `${colors.dim("Run `jsdoc-to-tsdoc convert --dry-run` to preview changes.")}\n`,
        );
      }
    } catch (error) {
      reportCommandFailure("scan", error);
    }
  },
});

/** What a classification run needs to know. */
interface ClassifyRun {
  readonly cwd: string;
  readonly files: readonly string[];
  readonly reportFormat: "json" | "md" | undefined;
  readonly failOnMissing: boolean;
  readonly failOnStale: boolean;
  /**
   * The `--enrich` provider, or `undefined` when the flag was not passed.
   *
   * @remarks
   * This is the single gate the whole feature hangs off: every reference to
   * `@/enricher` below is inside the branch guarded by this being defined, so
   * a run where it is `undefined` never imports a provider, never builds a
   * prompt, and never opens a socket or spawns a process.
   */
  readonly enrichProvider: EnrichProviderName | undefined;
}

/** What `--enrich` produced, ready for the report renderers. */
interface EnrichmentRun {
  readonly provider: EnrichProviderName;
  readonly outcomes: ReadonlyMap<DeclarationClassification, EnrichmentOutcome>;
}

/**
 * Classifies every file and emits the topology report.
 *
 * @param run - The run parameters.
 */
async function runClassify(run: ClassifyRun): Promise<void> {
  const classified: ClassifiedFile[] = [];

  for (const file of run.files) {
    const source = await readFile(file, "utf8");
    // Every scanned file gets an entry. A file that exports nothing carries a
    // null classification rather than being dropped, so `files.length` equals
    // `filesScanned` and a consumer can enumerate the "No exports" bucket the
    // human table has always shown.
    const classification =
      classifyFile(collectExportedDeclarations(source, file)) ?? null;
    classified.push({ path: relative(run.cwd, file), classification });
  }

  const summary = summarizeClassification(classified, run.files.length);
  const colors = createColors(
    run.reportFormat === undefined &&
      shouldUseColor(Boolean(process.stdout.isTTY)),
  );

  const enrichment =
    run.enrichProvider === undefined
      ? undefined
      : await runEnrichment(run.enrichProvider, summary);

  emitClassification(summary, run.reportFormat, colors, enrichment);

  const missing = missingCount(summary);
  const stale = staleCount(summary);
  if ((run.failOnMissing && missing > 0) || (run.failOnStale && stale > 0)) {
    process.exitCode = 3;
  }
}

/**
 * Runs `--enrich` over the summary's LOW-confidence and STALE declarations.
 *
 * @remarks
 * The only function in this file that touches `@/enricher`. A provider that
 * cannot be reached fails per-target (`EnrichmentOutcome.ok: false`, per
 * `AGENTS.md` §4 decision #10) — this never throws, so a run with, say,
 * `--enrich=ollama` and no daemon listening still finishes and prints the full
 * deterministic report, with every target reported as unavailable rather than
 * the command crashing or hanging.
 *
 * @param provider - The requested provider.
 * @param summary - The classification to pull targets from.
 * @returns The provider name and every target's outcome.
 */
async function runEnrichment(
  provider: EnrichProviderName,
  summary: ClassifySummary,
): Promise<EnrichmentRun> {
  const targets = selectEnrichmentTargets(summary.files);
  const outcomes = await enrichTargets(
    createEnrichmentProvider(provider),
    targets,
  );
  return { provider, outcomes };
}

/**
 * Writes the classification summary in the requested format.
 *
 * @param summary - The aggregated run result.
 * @param format - The `--report` format, or `undefined` for human output.
 * @param colors - Style functions for the terminal.
 * @param enrichment - The `--enrich` result, or `undefined` when the flag was
 * not passed — every branch below treats that as "add nothing", so the report
 * is byte-identical to a run without `--enrich` in that case.
 */
function emitClassification(
  summary: ClassifySummary,
  format: "json" | "md" | undefined,
  colors: Colors,
  enrichment: EnrichmentRun | undefined,
): void {
  if (format === "json") {
    process.stdout.write(
      `${toJsonReport({
        command: "scan",
        mode: "classify",
        filesScanned: summary.filesScanned,
        filesWithoutExports: summary.filesWithoutExports,
        declarationsClassified: summary.declarationsClassified,
        byTopology: summary.byTopology,
        byConfidence: summary.byConfidence,
        files: summary.files.map(({ path, classification }) =>
          classification === null
            ? { path, topology: null, confidence: null, declarations: [] }
            : {
                path,
                topology: classification.topology,
                confidence: classification.confidence,
                declarations: classification.declarations.map((declaration) => {
                  // Additive only: a declaration --enrich did not target (or
                  // that was never asked about at all) keeps its existing
                  // shape exactly, so the field is absent rather than null
                  // and a run without --enrich is unchanged byte for byte.
                  const outcome = enrichment?.outcomes.get(declaration);
                  return outcome === undefined
                    ? declaration
                    : { ...declaration, enrichment: outcome };
                }),
              },
        ),
      })}\n`,
    );
    return;
  }

  const rows: SummaryRow[] = topologyRows(summary).map(({ label, value }) => ({
    label,
    value,
  }));

  if (format === "md") {
    let body = `${toMarkdownTable("Topology", rows, "Files")}\n`;
    if (enrichment !== undefined) {
      body += enrichmentMarkdown(
        enrichmentFindings(summary, enrichment.outcomes),
        enrichment.provider,
      );
    }
    process.stdout.write(body);
    return;
  }

  process.stdout.write(
    `${colors.bold(`Documentation analysis — ${String(summary.filesScanned)} file(s) scanned`)}\n`,
  );
  process.stdout.write(`${formatTable(rows, colors)}\n`);
  for (const line of actionLines(summary, colors)) {
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write(
    `${colors.dim(`Confidence: ${confidenceLine(summary)}`)}\n`,
  );

  const stale = staleFindings(summary);
  if (stale.length > 0) {
    process.stdout.write(
      `\n${colors.bold("Stale documentation — review these by hand:")}\n`,
    );
    for (const { path, declaration } of stale) {
      process.stdout.write(
        `  ${colors.yellow(`${path}:${String(declaration.line)}`)} ${declaration.name}\n`,
      );
      for (const reason of declaration.stale) {
        process.stdout.write(`    ${colors.dim(reason)}\n`);
      }
    }
  }

  if (enrichment !== undefined) {
    printEnrichment(
      enrichmentFindings(summary, enrichment.outcomes),
      enrichment.provider,
      colors,
    );
  }
}

/**
 * Prints the human-readable enrichment section: every suggestion, then one
 * summary line naming how many targets a provider could not enrich.
 *
 * @remarks
 * Silent when there is nothing to say — `findings` is empty whenever
 * `--enrich` found no LOW-confidence or STALE declarations to ask about — the
 * same "stay quiet about clean results" rule the rest of this report follows.
 *
 * @param findings - Every enriched declaration and its outcome.
 * @param provider - Which provider ran, for the section heading.
 * @param colors - Style functions for the terminal.
 */
function printEnrichment(
  findings: readonly EnrichmentFinding[],
  provider: EnrichProviderName,
  colors: Colors,
): void {
  if (findings.length === 0) {
    return;
  }

  const succeeded = findings.filter(
    (
      finding,
    ): finding is EnrichmentFinding & {
      outcome: { ok: true; suggestion: string };
    } => finding.outcome.ok,
  );
  const failed = findings.filter((finding) => !finding.outcome.ok);

  process.stdout.write(
    `\n${colors.bold(
      `Enrichment (--enrich=${provider}) — ${String(succeeded.length)}/${String(findings.length)} suggestion(s):`,
    )}\n`,
  );
  for (const { path, declaration, outcome } of succeeded) {
    process.stdout.write(
      `  ${colors.yellow(`${path}:${String(declaration.line)}`)} ${declaration.name}\n`,
    );
    for (const line of outcome.suggestion.split("\n")) {
      process.stdout.write(`    ${colors.dim(line)}\n`);
    }
  }

  if (failed.length === 0) {
    return;
  }
  // Only the first failure's detail is shown, deliberately: every target in
  // one run shares the same provider, and a provider fails the same way for
  // all of them within a run (the daemon is down, the key is unset, the CLI
  // is missing) — printing N copies of an identical message would not add
  // information. A future provider whose failure genuinely varies per target
  // would need every distinct detail listed; nothing here does yet.
  const [firstFailure] = failed;
  // Provider detail strings are full sentences with their own punctuation
  // (some end in a period, some in a parenthesis) — a colon reads correctly
  // either way, where appending a trailing period would sometimes double one.
  const detail =
    firstFailure !== undefined && !firstFailure.outcome.ok
      ? `: ${firstFailure.outcome.detail}`
      : "";
  process.stdout.write(
    `${colors.dim(
      `Enrichment unavailable for ${String(failed.length)} ${failed.length === 1 ? "entry" : "entries"}${detail}`,
    )}\n`,
  );
}

/**
 * Renders the `--report=md` enrichment section: a heading, then a plain list
 * of suggestions and failures.
 *
 * @remarks
 * Not a `toMarkdownTable` row: a suggestion is prose, not a single scalar
 * value, so forcing it into a two-column table would either truncate it or
 * break the table on an embedded `|`. Appended after the existing topology
 * table rather than replacing it, so an existing `--report=md` consumer that
 * only reads that table is unaffected.
 *
 * @param findings - Every enriched declaration and its outcome.
 * @param provider - Which provider ran, for the section heading.
 * @returns The Markdown section text, or an empty string when there is
 * nothing to enrich.
 */
function enrichmentMarkdown(
  findings: readonly EnrichmentFinding[],
  provider: EnrichProviderName,
): string {
  if (findings.length === 0) {
    return "";
  }

  const lines = [`\n### Enrichment (\`--enrich=${provider}\`)\n`];
  for (const { path, declaration, outcome } of findings) {
    const where = `\`${path}:${String(declaration.line)}\` **${declaration.name}**`;
    lines.push(
      outcome.ok
        ? `- ${where} — ${outcome.suggestion.split("\n").join(" ")}`
        : `- ${where} — unavailable: ${outcome.detail}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
