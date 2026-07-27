/**
 * Aggregation of per-declaration topologies into one verdict per file.
 *
 * @remarks
 * A report that listed every declaration would be as long as the codebase. The
 * useful unit is the file, because the recommended action — run `scaffold`,
 * run `convert`, read it yourself — is taken per file.
 *
 * @since 0.1.0
 */

import {
  classifyDeclaration,
  confidenceOf,
  type Confidence,
  type DeclarationClassification,
  type Topology,
} from "@/classifier/topology";
import type { ExportedDeclaration } from "@/scanner";

/**
 * Topologies from the least to the most work a human has to do about them.
 *
 * @remarks
 * A file lands in one bucket, and it should be the one that names the next
 * action. Severity is therefore ordered by how much human input the fix needs:
 * `stale` documentation has to be read and corrected by someone who knows the
 * intent; `no-docs` needs prose invented and then reviewed; `line-comments`
 * already has prose to reuse; `partial` needs a few tags; `valid` needs nothing.
 */
const SEVERITY: readonly Topology[] = Object.freeze([
  "valid",
  "partial",
  "line-comments",
  "no-docs",
  "stale",
]);

/** Every topology, in report order. */
export const TOPOLOGIES: readonly Topology[] = Object.freeze([
  "valid",
  "partial",
  "line-comments",
  "no-docs",
  "stale",
]);

/** The verdict for one file. */
export interface FileClassification {
  /** The most severe topology among the file's exports. */
  readonly topology: Topology;
  /** The confidence level that follows from {@link FileClassification.topology}. */
  readonly confidence: Confidence;
  /** Every export's own verdict, in source order. */
  readonly declarations: readonly DeclarationClassification[];
  /** How many exports fall in each topology. */
  readonly counts: Readonly<Record<Topology, number>>;
}

/**
 * Builds a zeroed count for every topology.
 *
 * @returns A mutable record with one entry per topology.
 */
function emptyCounts(): Record<Topology, number> {
  return {
    valid: 0,
    partial: 0,
    "line-comments": 0,
    "no-docs": 0,
    stale: 0,
  };
}

/**
 * Classifies a file from its exported declarations.
 *
 * @param declarations - Every export the file publishes.
 * @returns The file's verdict, or `undefined` when it exports nothing — such a
 * file has no documentation coverage to judge, and counting it as `valid`
 * would inflate the number of files reported as ready to convert.
 */
export function classifyFile(
  declarations: readonly ExportedDeclaration[],
): FileClassification | undefined {
  if (declarations.length === 0) {
    return undefined;
  }

  const classified = declarations.map(classifyDeclaration);
  const counts = emptyCounts();
  for (const declaration of classified) {
    counts[declaration.topology] += 1;
  }

  let topology: Topology = "valid";
  for (const declaration of classified) {
    if (SEVERITY.indexOf(declaration.topology) > SEVERITY.indexOf(topology)) {
      topology = declaration.topology;
    }
  }

  return {
    topology,
    confidence: confidenceOf(topology),
    declarations: classified,
    counts,
  };
}
