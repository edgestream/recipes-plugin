import { sourceRef, type RecipesService } from "@edgestream/recipes-application";
import { McpServer } from "@modelcontextprotocol/server";
import { recipeResult, summaryFromRecord } from "./presentation.js";
import { cursorSchema, limitSchema, recipeIdSchema } from "./schemas.js";
import { z } from "zod";

export function registerRecipeTools(server: McpServer, recipes: RecipesService, providers: readonly string[]): void {
  const defaultProvider = providers[0] ?? "personal";
  const providerSchema = z.string()
    .refine((provider) => providers.includes(provider), `Provider must be one of: ${providers.join(", ")}.`)
    .default(defaultProvider);

  if (recipes.capabilities.search) server.registerTool(
    "search_recipes",
    {
      title: "Search recipes",
      description: "Search the configured recipe providers and return provider-qualified recipe resources.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Words to find in recipe JSON-LD."),
        cursor: cursorSchema,
        limit: limitSchema,
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, cursor, limit }, context) => {
      const request = cursor === undefined ? { query, limit } : { query, cursor, limit };
      const page = await recipes.searchRecipes(request, { signal: context.mcpReq.signal });
      const results = page.items.map(recipeResult);
      return {
        content: results.map(({ uri, name, description }) => ({
          type: "resource_link" as const,
          uri,
          name,
          description,
          mimeType: "application/ld+json",
        })),
        structuredContent: { results, nextCursor: page.nextCursor ?? null },
      };
    },
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Get recipe",
      description: "Retrieve a complete schema.org Recipe document by provider and provider-local id.",
      inputSchema: z.object({ provider: providerSchema, id: recipeIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ provider, id }, context) => {
      const recipe = await recipes.getRecipe({ provider, id }, { signal: context.mcpReq.signal });
      if (!recipe) return { content: [{ type: "text" as const, text: `Recipe ${provider}/${id} was not found.` }], isError: true };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(recipe.document) }],
        structuredContent: { provider, id, recipe: recipe.document },
      };
    },
  );

  if (recipes.capabilities.import) server.registerTool(
    "import_recipe",
    {
      title: "Import recipe",
      description: "Import a schema.org Recipe JSON document from a file or HTTP(S) URL into the personal collection.",
      inputSchema: z.object({
        source: z.string().trim().min(1).describe("A file path, file: URL, or HTTP(S) URL to a recipe document."),
        id: recipeIdSchema.optional().describe("Optional stable personal recipe id."),
      }),
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ source, id }, context) => {
      const request = id === undefined ? { source: sourceRef(source) } : { source: sourceRef(source), id };
      const imported = await recipes.importRecipe(request, { signal: context.mcpReq.signal });
      const result = recipeResult(summaryFromRecord(imported));
      return {
        content: [{
          type: "resource_link" as const,
          uri: result.uri,
          name: result.name,
          description: result.description,
          mimeType: "application/ld+json",
        }],
        structuredContent: result,
      };
    },
  );

  if (recipes.capabilities.delete) server.registerTool(
    "delete_recipe",
    {
      title: "Delete recipe",
      description: "Permanently delete a recipe from a writable recipe catalog.",
      inputSchema: z.object({ provider: providerSchema, id: recipeIdSchema }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ provider, id }, context) => {
      await recipes.deleteRecipe({ provider, id }, { signal: context.mcpReq.signal });
      return {
        content: [{ type: "text" as const, text: `Deleted recipe ${provider}/${id}.` }],
        structuredContent: { provider, id },
      };
    },
  );
}
