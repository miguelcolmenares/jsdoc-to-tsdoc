/**
 * @packageDocumentation
 * Public API of the scanner domain: source-file discovery, doc-comment
 * extraction via the TypeScript compiler API, and path filtering.
 *
 * @since 0.1.0
 */

export {
  applyEdits,
  extractJsDocComments,
  type SourceComment,
  type SourceEdit,
} from "@/scanner/comment-extractor";

export {
  createPathFilter,
  globToRegExp,
  matchesGlob,
  normalizePath,
} from "@/scanner/path-filter";

export {
  DEFAULT_IGNORE_DIRS,
  findSourceFiles,
  type FindSourceFilesOptions,
} from "@/scanner/project-scanner";
