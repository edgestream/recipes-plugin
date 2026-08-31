import { parseRecipeUri, recipeUri, type RecipesService } from "@edgestream/recipes-application";
import type { RecipeSummary } from "@edgestream/recipes-core";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { recipeIdSchema } from "./schemas.js";
import { recipeMetadata } from "./presentation.js";
import type { RecipeProviderPresentation } from "./createServer.js";

export function registerRecipeResources(
  server: McpServer,
  recipes: RecipesService,
  providers: readonly RecipeProviderPresentation[],
): void {
  const providerIds = new Set(providers.map((provider) => provider.id));
  for (const provider of providers.filter((candidate) => candidate.enumerateResources)) {
    const indexUri = `recipes://${provider.id}`;
    server.registerResource(
      `${provider.id}-recipes`,
      indexUri,
      {
        title: `${provider.title} index`,
        description: `Read ${indexUri} to list every recipe in this collection. Use ${indexUri}/{id} to read a complete recipe.`,
        mimeType: "application/json",
      },
      async (uri, context) => ({
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ recipes: (await allRecipes(recipes, context.mcpReq.signal)).map(recipeMetadata) }),
        }],
      }),
    );
  }

  const recipeTemplate = new ResourceTemplate("recipes://{provider}/{id}", {
    list: providers.some((provider) => provider.enumerateResources)
      ? async (context) => ({
          resources: (await allRecipes(recipes, context.mcpReq.signal)).map((summary) => ({
            uri: recipeUri(summary.ref),
            name: summary.name,
            mimeType: "application/ld+json",
          })),
        })
      : undefined,
  });
  server.registerResource(
    "recipe",
    recipeTemplate,
    {
      title: "Recipe",
      description: "Read recipes://{provider}/{id} to retrieve one complete schema.org Recipe document.",
      mimeType: "application/ld+json",
    },
    async (uri, _variables, context) => {
      const ref = parseRecipeUri(uri.href);
      if (!providerIds.has(ref.provider)) throw new Error(`Provider ${ref.provider} is not configured.`);
      const id = recipeIdSchema.parse(ref.id);
      const recipe = await recipes.getRecipe(ref, { signal: context.mcpReq.signal });
      if (!recipe) throw new Error(`Recipe ${id} was not found.`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/ld+json",
          text: JSON.stringify(recipe.document),
        }],
      };
    },
  );
}

async function allRecipes(recipes: RecipesService, signal?: AbortSignal): Promise<RecipeSummary[]> {
  const items: RecipeSummary[] = [];
  let cursor: string | undefined;
  do {
    const request = cursor === undefined ? { limit: 100 } : { cursor, limit: 100 };
    const page = await recipes.listRecipes(request, signal === undefined ? undefined : { signal });
    items.push(...page.items);
    if (page.nextCursor !== undefined && page.nextCursor === cursor) {
      throw new Error("Recipe catalog returned a repeating cursor.");
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return items;
}
