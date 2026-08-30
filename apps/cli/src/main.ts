#!/usr/bin/env node

import { createLocalRecipes } from "@edgestream/recipes-runtime";
import { parseArguments } from "./arguments.js";
import { executeCommand } from "./commands.js";

export async function main(args: readonly string[]): Promise<number> {
  return executeCommand(parseArguments(args), createLocalRecipes(), process.stdout);
}

if (import.meta.main) main(process.argv.slice(2)).then(
  (exitCode) => { process.exitCode = exitCode; },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  },
);
