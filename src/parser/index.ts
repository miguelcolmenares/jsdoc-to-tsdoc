/**
 * @packageDocumentation
 * Public API of the parser domain: comment-line traversal, the JSDoc → TSDoc
 * tag registry, and comment inspection — which tags and names a comment
 * carries, and where its `@property` prose sits.
 *
 * @since 0.1.0
 */

export {
  mapCommentLines,
  type CommentLineContext,
  type CommentLineMapper,
} from "@/parser/comment-lines";

export {
  getBlockTags,
  getCommentTags,
  getDocumentedParams,
  getDocumentedTypeParams,
  hasTypeBraces,
  mayHoldPropertyTag,
  readPropertyTags,
  type PropertyTag,
} from "@/parser/jsdoc-parser";

export {
  ACCESS_MODIFIERS,
  isRemovableTag,
  JSDOC_ONLY_TAGS,
  leadingTag,
  PACKAGE_DOC_TAGS,
  PREFIX_ONLY_TAGS,
  REDUNDANT_TAGS,
  TAG_RENAMES,
} from "@/parser/tag-registry";
