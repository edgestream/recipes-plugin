import { parseRecipeUri, sourceRef, type ImportRecipeRequest, type RecipesService } from "@edgestream/recipes-application";
import { assertRecipeId, type RecipeRef, type RecipeSummary } from "@edgestream/recipes-core";
import type { CliCommand } from "./arguments.js";
import { writeDocument, writeSearchResult, writeSummary, writeUsage, type CliOutput } from "./output.js";

const defaultSearchLimit = 20;

export interface CliRuntime {
  readonly recipes: RecipesService;
  readonly provider: string;
}

export async function executeCommand(command: CliCommand, runtime: CliRuntime, output: CliOutput): Promise<number> {
  switch (command.type) {
    case "import": {
      const imported = await runtime.recipes.importRecipe(importRequest(command.source, command.id));
      output.write(`${imported.ref.id}\n`);
      return 0;
    }
    case "delete": {
      const ref = recipeReference(command.reference, runtime.provider);
      await runtime.recipes.deleteRecipe(ref);
      output.write(`${ref.id}\n`);
      return 0;
    }
    case "list":
      await forEachPage((cursor) => runtime.recipes.listRecipes(pageRequest(cursor)), (item) => writeSummary(output, item));
      return 0;
    case "search": {
      const page = await runtime.recipes.searchRecipes(searchRequest(command.query));
      page.items.forEach((item) => writeSearchResult(output, item));
      return 0;
    }
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

function importRequest(value: string, id: string | undefined): ImportRecipeRequest {
  const target = value.startsWith("recipes://")
    ? { reference: parseRecipeUri(value) }
    : { source: sourceRef(value) };
  return id === undefined ? target : { ...target, id };
}

function recipeReference(value: string, provider: string): RecipeRef {
  if (value.startsWith("recipes://")) return parseRecipeUri(value);
  assertRecipeId(value);
  return { provider, id: value };
}

function pageRequest(cursor: string | undefined) {
  return cursor === undefined ? { limit: 100 } : { cursor, limit: 100 };
}

function searchRequest(query: string) {
  return { query, limit: defaultSearchLimit };
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
