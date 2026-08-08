/**
 * @packageDocumentation
 * Programmatic entry point for jsdoc-to-tsdoc.
 *
 * Re-exports the public surface of every domain that answers a question about
 * source code, so the package can be consumed as a library in addition to the
 * `jsdoc-to-tsdoc` CLI binary. `reporter`, `prompter` and `writer` are
 * deliberately absent: they render to a terminal, prompt on it, and write to
 * disk for the CLI, and a library consumer supplies its own output and I/O.
 *
 * A domain added without a re-export here is invisible to library consumers,
 * which is what `public-surface.test.ts` pins.
 *
 * @since 0.1.0
 */

/** The current package version. */
export const VERSION = "0.1.0";

export {
  classifyDeclaration,
  classifyFile,
  confidenceOf,
  TOPOLOGIES,
  type Confidence,
  type DeclarationClassification,
  type FileClassification,
  type Topology,
} from "@/classifier";
export {
  checkSourceText,
  type CheckProblem,
  type FileCheck,
  type ProblemKind,
} from "@/commands/check-file";
export {
  convertSourceText,
  type FileConversion,
} from "@/commands/convert-file";
export {
  scaffoldSourceText,
  type FileScaffold,
  type StubCounts,
} from "@/commands/scaffold-file";
export {
  PRESENCE_RULE_ID,
  runPreflight,
  updateRuleSeverity,
  type PreflightResult,
  type RuleSeverity,
  type RuleSeverityUpdate,
  type SeverityOccurrence,
} from "@/escalator";
export {
  aggregateCommentTags,
  collectProjectTags,
  detectProject,
  generateTsdocJson,
  installCommand,
  mergeTsdocJson,
  missingPackages,
  patchEslintFlatConfig,
  type CustomTagReport,
  type EslintPatchResult,
  type PackageManager,
  type ProjectLayout,
} from "@/generator";
export {
  getBlockTags,
  hasTypeBraces,
  mapCommentLines,
  readPropertyTags,
  type CommentLineContext,
  type CommentLineMapper,
  type PropertyTag,
} from "@/parser";
export {
  buildStub,
  inferComponentSummary,
  inferFunctionSummary,
  inferHookSummary,
  inferNounSummary,
  TODO_MARKER,
} from "@/scaffolder";
export {
  collectExportedDeclarations,
  collectMemberTargets,
  extractJsDocComments,
  findSourceFiles,
  undocumentedDeclarations,
  type ExportedDeclaration,
  type ExportKind,
  type MemberTarget,
  type SourceComment,
} from "@/scanner";
export {
  createTsdocValidator,
  type TsdocValidator,
  type TsdocViolation,
} from "@/validator";
export {
  runPipeline,
  RULES,
  type PipelineResult,
  type Rule,
  type RuleContext,
} from "@/transformer";
