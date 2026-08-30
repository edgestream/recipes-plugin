import { parseRecipeUri, sourceRef, type RecipesService } from "@edgestream/recipes-application";
import { assertRecipeId, type RecipeRef, type RecipeSummary } from "@edgestream/recipes-core";
import type { CliCommand } from "./arguments.js";
import { writeDocument, writeSummary, writeUsage, type CliOutput } from "./output.js";

export interface CliRuntime {
  readonly recipes: RecipesService;
  readonly provider: string;
}

export async function executeCommand(command: CliCommand, runtime: CliRuntime, output: CliOutput): Promise<number> {
  switch (command.type) {
    case "import": {
      const request = command.id === undefined
        ? { source: sourceRef(command.source) }
        : { source: sourceRef(command.source), id: command.id };
      const imported = await runtime.recipes.importRecipe(request);
      output.write(`${imported.ref.id}\n`);
      return 0;
    }
    case "list":
      await forEachPage((cursor) => runtime.recipes.listRecipes(pageRequest(cursor)), (item) => writeSummary(output, item));
      return 0;
    case "search":
      await forEachPage(
        (cursor) => runtime.recipes.searchRecipes(searchRequest(command.query, cursor)),
        (item) => writeSummary(output, item),
      );
      return 0;
    case "show": {
      const recipe = await runtime.recipes.getRecipe(recipeReference(command.reference, runtime.provider));
      if (!recipe) throw new Error(`recipe "${command.reference}" not found.`);
      writeDocument(output, recipe.document);
      return 0;
    }
    case "help":
      writeUsage(output);
      return command.invalid ? 1 : 0;
  }
}

function recipeReference(value: string, provider: string): RecipeRef {
  if (value.startsWith("recipes://")) return parseRecipeUri(value, provider);
  assertRecipeId(value);
  return { provider, id: value };
}

function pageRequest(cursor: string | undefined) {
  return cursor === undefined ? { limit: 100 } : { cursor, limit: 100 };
}

function searchRequest(query: string, cursor: string | undefined) {
  return cursor === undefined ? { query, limit: 100 } : { query, cursor, limit: 100 };
}

async function forEachPage(
  getPage: (cursor: string | undefined) => Promise<{ readonly items: readonly RecipeSummary[]; readonly nextCursor?: string }>,
  visit: (item: RecipeSummary) => void,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await getPage(cursor);
    page.items.forEach(visit);
    if (page.nextCursor !== undefined && page.nextCursor === cursor) {
      throw new Error("Recipe catalog returned a repeating cursor.");
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
}
