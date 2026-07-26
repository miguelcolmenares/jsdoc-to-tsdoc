/**
 * @packageDocumentation
 * Public API of the validator domain: doc-comment validation against the
 * official `@microsoft/tsdoc` parser, configured from the project's own
 * `tsdoc.json`.
 *
 * @since 0.1.0
 */

export {
  createTsdocValidator,
  type TsdocValidator,
  type TsdocViolation,
} from "@/validator/tsdoc-validator";
