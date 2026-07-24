/**
 * @packageDocumentation
 * Public API of the generator domain: project detection, custom-tag
 * classification, `tsdoc.json` generation, and ESLint flat-config patching that
 * together power the `init` bootstrap command.
 *
 * @since 0.1.0
 */

export {
  aggregateCommentTags,
  collectProjectTags,
  type CustomTagReport,
  type TagUsage,
} from "@/generator/custom-tag-detector";

export {
  buildTsdocConfigSnippet,
  patchEslintFlatConfig,
  type EslintPatchResult,
  type PatchEslintOptions,
  type Severity,
} from "@/generator/eslint-config-patcher";

export {
  detectProject,
  installCommand,
  missingPackages,
  REQUIRED_PACKAGES,
  type PackageManager,
  type ProjectLayout,
} from "@/generator/project-detector";

export {
  classifyTag,
  KNOWN_CUSTOM_BLOCK_TAGS,
  STANDARD_TSDOC_BLOCK_TAGS,
  STANDARD_TSDOC_INLINE_TAGS,
  STANDARD_TSDOC_MODIFIER_TAGS,
  type TagClassification,
} from "@/generator/tsdoc-tags";

export {
  generateTsdocJson,
  mergeTsdocJson,
  type TagSyntaxKind,
  type TsdocTagDefinition,
} from "@/generator/tsdoc-json-generator";
