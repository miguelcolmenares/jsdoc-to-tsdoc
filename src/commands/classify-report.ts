/**
 * Aggregation and rendering of the `scan --classify` documentation topology
 * report.
 *
 * @remarks
 * Kept apart from the command so the aggregation is pure and unit-testable, in
 * the same shape as `check-file` and `convert-file`.
 *
 * The human report shows the summary plus the findings a person has to act on
 * by hand; the full per-declaration detail is reserved for `--report=json`,
 * where something is reading it. Printing every gap in a real codebase would
 * produce thousands of lines nobody reads.
 *
 * @since 0.1.0
 */

import {
  TOPOLOGIES,
  type Confidence,
  type DeclarationClassification,
  type FileClassification,
  type Topology,
} from "@/classifier";
import type { Colors } from "@/reporter";

/** One classified file. */
export interface ClassifiedFile {
  /** Path relative to the scanned directory. */
  readonly path: string;
  /** The file's verdict. */
  readonly classification: FileClassification;
}

/** The aggregate result of a classification run. */
export interface ClassifySummary {
  /** How many files were read. */
  readonly filesScanned: number;
  /**
   * How many of those export nothing, and so have no documentation coverage to
   * judge. Reported separately rather than folded into `valid`, which would
   * overstate how much of the project is ready to convert.
   */
  readonly filesWithoutExports: number;
  /** Files per topology. */
  readonly byTopology: Readonly<Record<Topology, number>>;
  /** Files per confidence level. */
  readonly byConfidence: Readonly<Record<Confidence, number>>;
  /** How many exported declarations were classified in total. */
  readonly declarationsClassified: number;
  /** Every classified file, in scan order. */
  readonly files: readonly ClassifiedFile[];
}

const TOPOLOGY_LABELS: Readonly<Record<Topology, string>> = Object.freeze({
  valid: "Valid TSDoc",
  partial: "Partial docs",
  "line-comments": "Line comments",
  "no-docs": "No docs",
  stale: "Stale docs",
});

const TOPOLOGY_ACTIONS: Readonly<Record<Topology, string>> = Object.freeze({
  valid: "ready for `convert`",
  partial: "`convert`, then fill the gaps",
  "line-comments": "prose to promote into `/** */`",
  "no-docs": "run `scaffold`",
  stale: "manual review required",
});

const CONFIDENCE_ORDER: readonly Confidence[] = Object.freeze([
  "high",
  "medium",
  "low",
  "stale",
]);

/**
 * Aggregates classified files into the run summary.
 *
 * @param files - The classified files, in scan order.
 * @param filesScanned - How many files were read in total.
 * @returns The {@link ClassifySummary}.
 */
export function summarizeClassification(
  files: readonly ClassifiedFile[],
  filesScanned: number,
): ClassifySummary {
  const byTopology: Record<Topology, number> = {
    valid: 0,
    partial: 0,
    "line-comments": 0,
    "no-docs": 0,
    stale: 0,
  };
  const byConfidence: Record<Confidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
    stale: 0,
  };
  let declarationsClassified = 0;

  for (const { classification } of files) {
    byTopology[classification.topology] += 1;
    byConfidence[classification.confidence] += 1;
    declarationsClassified += classification.declarations.length;
  }

  return {
    filesScanned,
    filesWithoutExports: filesScanned - files.length,
    byTopology,
    byConfidence,
    declarationsClassified,
    files,
  };
}

/**
 * Collects every declaration whose documentation contradicts its signature.
 *
 * @param summary - The run summary.
 * @returns One entry per stale declaration, with the file it lives in.
 */
export function staleFindings(summary: ClassifySummary): readonly {
  readonly path: string;
  readonly declaration: DeclarationClassification;
}[] {
  const findings: {
    readonly path: string;
    readonly declaration: DeclarationClassification;
  }[] = [];

  for (const { path, classification } of summary.files) {
    for (const declaration of classification.declarations) {
      if (declaration.topology === "stale") {
        findings.push({ path, declaration });
      }
    }
  }

  return findings;
}

/**
 * Counts the exports that carry no TSDoc comment at all.
 *
 * @remarks
 * Prose written as `//` lines counts as missing: a human documented the export,
 * but nothing in the TSDoc toolchain can see it, which is exactly what
 * `--fail-on-missing` is meant to catch.
 *
 * @param summary - The run summary.
 * @returns How many declarations have no doc comment.
 */
export function missingCount(summary: ClassifySummary): number {
  let missing = 0;
  for (const { classification } of summary.files) {
    missing +=
      classification.counts["no-docs"] + classification.counts["line-comments"];
  }
  return missing;
}

/**
 * Counts the declarations whose documentation contradicts the signature.
 *
 * @param summary - The run summary.
 * @returns How many declarations are stale.
 */
export function staleCount(summary: ClassifySummary): number {
  let stale = 0;
  for (const { classification } of summary.files) {
    stale += classification.counts.stale;
  }
  return stale;
}

/**
 * Builds the label/value rows for the topology table.
 *
 * @param summary - The run summary.
 * @returns One row per topology, plus the files that export nothing.
 */
export function topologyRows(
  summary: ClassifySummary,
): readonly { readonly label: string; readonly value: number }[] {
  return [
    ...TOPOLOGIES.map((topology) => ({
      label: TOPOLOGY_LABELS[topology],
      value: summary.byTopology[topology],
    })),
    { label: "No exports", value: summary.filesWithoutExports },
  ];
}

/**
 * Renders the confidence line.
 *
 * @param summary - The run summary.
 * @returns A single line such as `HIGH 84 · MEDIUM 12 · LOW 27 · STALE 4`.
 */
export function confidenceLine(summary: ClassifySummary): string {
  return CONFIDENCE_ORDER.map(
    (level) => `${level.toUpperCase()} ${String(summary.byConfidence[level])}`,
  ).join(" · ");
}

/**
 * Renders the per-topology action hints for the buckets that are not empty.
 *
 * @param summary - The run summary.
 * @param colors - Style functions for the terminal.
 * @returns One line per non-empty bucket, or an empty array when all are.
 */
export function actionLines(
  summary: ClassifySummary,
  colors: Colors,
): readonly string[] {
  return TOPOLOGIES.filter((topology) => summary.byTopology[topology] > 0).map(
    (topology) =>
      colors.dim(
        `  ${TOPOLOGY_LABELS[topology].padEnd(15)}${String(
          summary.byTopology[topology],
        ).padStart(5)} file(s) → ${TOPOLOGY_ACTIONS[topology]}`,
      ),
  );
}
