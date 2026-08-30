import type { RecipesService } from "@edgestream/recipes-application";
import { McpServer } from "@modelcontextprotocol/server";
import { registerRecipeResources } from "./resources.js";
import { registerRecipeTools } from "./tools.js";

export interface RecipesMcpOptions {
  readonly recipes: RecipesService;
  readonly providers?: readonly RecipeProviderPresentation[];
  readonly version?: string;
}

export interface RecipeProviderPresentation {
  readonly id: string;
  readonly title: string;
  readonly enumerateResources: boolean;
}

/** Creates the MCP presentation layer without constructing infrastructure. */
export function createRecipesMcpServer({
  recipes,
  providers = [{ id: "personal", title: "Personal recipes", enumerateResources: true }],
  version = "0.1.0",
}: RecipesMcpOptions): McpServer {
  const server = new McpServer({ name: "recipes", version });
  for (const provider of providers) {
    registerRecipeResources(server, recipes, {
      provider: provider.id,
      providerTitle: provider.title,
      enumerateResources: provider.enumerateResources,
    });
  }
  registerRecipeTools(server, recipes, providers.map((provider) => provider.id));
  return server;
}
