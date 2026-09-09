/**
 * @packageDocumentation
 * Public API of the scanner domain: source-file discovery, doc-comment
 * extraction via the TypeScript compiler API, export inventory, the interface
 * members a comment's `@property` tags could move onto, the same members as
 * individually documentable declarations, and path filtering.
 *
 * @since 0.1.0
 */

export {
  checkCompilerApi,
  type CompilerApiCheck,
} from "@/scanner/compiler-api";

export {
  applyEdits,
  extractJsDocComments,
  type SourceComment,
  type SourceEdit,
} from "@/scanner/comment-extractor";

export {
  collectExportedDeclarations,
  undocumentedDeclarations,
  type ExportedDeclaration,
  type ExportKind,
  type ExportParameter,
  type LeadingComment,
} from "@/scanner/export-inventory";

export { isFunctionLikeKind } from "@/scanner/declaration-classifier";

export {
  findShadowedDocComment,
  isToolDirective,
} from "@/scanner/insertion-location";

export {
  collectMemberTargets,
  type MemberTarget,
} from "@/scanner/member-targets";

export {
  collectMemberDeclarations,
  type MemberDeclaration,
} from "@/scanner/member-declarations";

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
