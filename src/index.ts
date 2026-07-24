/**
 * @packageDocumentation
 * Programmatic entry point for jsdoc-to-tsdoc.
 *
 * Re-exports the public surface of each domain so the package can be consumed
 * as a library in addition to the `jsdoc-to-tsdoc` CLI binary.
 *
 * @since 0.1.0
 */

/** The current package version. */
export const VERSION = "0.1.0";

export { convertSourceText, type FileConversion } from "@/commands/convert-file";
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
  type CommentLineContext,
  type CommentLineMapper,
} from "@/parser";
export {
  extractJsDocComments,
  findSourceFiles,
  type SourceComment,
} from "@/scanner";
export {
  runPipeline,
  RULES,
  type PipelineResult,
  type Rule,
  type RuleContext,
} from "@/transformer";
