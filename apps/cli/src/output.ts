import { recipeUri } from "@edgestream/recipes-application";
import type { RecipeDocument, RecipeSummary } from "@edgestream/recipes-core";

export interface CliOutput {
  write(value: string): void;
}

export function writeSummary(output: CliOutput, summary: RecipeSummary): void {
  output.write(`${summary.ref.id}: ${summary.name}\n`);
}

export function writeSearchResult(output: CliOutput, summary: RecipeSummary): void {
  output.write(`${recipeUri(summary.ref)}: ${summary.name}\n`);
}

export function writeDocument(output: CliOutput, document: RecipeDocument): void {
  output.write(`${JSON.stringify(document, null, 2)}\n`);
}

export function writeUsage(output: CliOutput): void {
  output.write("Usage:\n");
  output.write("  recipes import <url> [--id <id>]\n");
  output.write("  recipes delete <id|recipes://provider/id>\n");
  output.write("  recipes list\n");
  output.write("  recipes search <query>\n");
  output.write("  recipes show <id|recipes://provider/id>\n");
}
