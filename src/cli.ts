#!/usr/bin/env node
/**
 * @packageDocumentation
 * CLI entry point. Parses `argv` with citty and dispatches to a subcommand.
 *
 * @since 0.1.0
 */

import { defineCommand, runMain } from "citty";
import * as ts from "typescript";

import {
  checkCommand,
  convertCommand,
  escalateCommand,
  initCommand,
  mergeDriverCommand,
  scaffoldCommand,
  scanCommand,
} from "@/commands";
import { VERSION } from "@/index";
import { checkCompilerApi } from "@/scanner";

// Fail here, once, rather than several frames deep inside whichever command
// first reaches for the Compiler API. A `typescript` that imports cleanly but
// carries no `createSourceFile` used to surface as
// `Cannot read properties of undefined (reading 'TSX')`, which names neither
// TypeScript nor the version that caused it.
const compilerApi = checkCompilerApi(ts);
if (!compilerApi.ok) {
  process.stderr.write(`jsdoc-to-tsdoc: ${compilerApi.reason}\n`);
  process.exit(2);
}

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
    check: checkCommand,
    "merge-driver": mergeDriverCommand,
  },
});

void runMain(main);
