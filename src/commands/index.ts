/**
 * @packageDocumentation
 * Barrel for the CLI subcommands and the shared conversion orchestrator.
 *
 * @since 0.1.0
 */

export { default as convertCommand } from "@/commands/convert";
export { default as initCommand } from "@/commands/init";
export { default as scaffoldCommand } from "@/commands/scaffold";
export { default as scanCommand } from "@/commands/scan";

export { convertSourceText, type FileConversion } from "@/commands/convert-file";

export {
  scaffoldSourceText,
  type FileScaffold,
  type StubCounts,
} from "@/commands/scaffold-file";
