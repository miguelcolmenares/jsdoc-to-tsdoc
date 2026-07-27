/**
 * @packageDocumentation
 * Public API of the classifier domain: how well each export is documented, how
 * much of that documentation can be trusted, and the resulting verdict per file.
 *
 * @since 0.1.0
 */

export {
  classifyFile,
  TOPOLOGIES,
  type FileClassification,
} from "@/classifier/file-classification";

export {
  classifyDeclaration,
  confidenceOf,
  type Confidence,
  type DeclarationClassification,
  type Topology,
} from "@/classifier/topology";
