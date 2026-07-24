#!/usr/bin/env node
/**
 * @packageDocumentation
 * CLI entry point. Parses `argv` with citty and dispatches to a subcommand.
 *
 * @since 0.1.0
 */

import { defineCommand, runMain } from "citty";

import { convertCommand, scanCommand } from "@/commands";
import { VERSION } from "@/index";

const main = defineCommand({
  meta: {
    name: "jsdoc-to-tsdoc",
    version: VERSION,
    description: "Migrate JSDoc comments to the TSDoc standard.",
  },
  subCommands: {
    scan: scanCommand,
    convert: convertCommand,
  },
});

void runMain(main);
