#!/usr/bin/env node
/**
 * @packageDocumentation
 * CLI entry point. Parses `argv` with citty and dispatches to a subcommand.
 *
 * @since 0.1.0
 */

import { defineCommand, runMain } from "citty";

import {
  convertCommand,
  escalateCommand,
  initCommand,
  scaffoldCommand,
  scanCommand,
} from "@/commands";
import { VERSION } from "@/index";

const main = defineCommand({
  meta: {
    name: "jsdoc-to-tsdoc",
    version: VERSION,
    description: "Migrate JSDoc comments to the TSDoc standard.",
  },
  subCommands: {
    init: initCommand,
    scan: scanCommand,
    convert: convertCommand,
    scaffold: scaffoldCommand,
    escalate: escalateCommand,
  },
});

void runMain(main);
