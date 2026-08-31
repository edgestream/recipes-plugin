import type { RecipesService } from "@edgestream/recipes-application";
import { McpServer } from "@modelcontextprotocol/server";
import { registerRecipeResources } from "./resources.js";
import { registerRecipeTools } from "./tools.js";

export interface RecipesMcpOptions {
  readonly recipes: RecipesService;
  readonly providers: readonly RecipeProviderPresentation[];
  readonly defaultProvider: string;
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
  providers,
  defaultProvider,
  version = "0.1.0",
}: RecipesMcpOptions): McpServer {
  if (!providers.some((provider) => provider.id === defaultProvider)) {
    throw new TypeError("The MCP default provider must be registered in the runtime.");
  }
  const server = new McpServer({ name: "recipes", version });
  registerRecipeResources(server, recipes, providers);
  registerRecipeTools(server, recipes, providers.map((provider) => provider.id), defaultProvider);
  return server;
}
