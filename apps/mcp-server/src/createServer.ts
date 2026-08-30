import type { RecipesService } from "@edgestream/recipes-application";
import { McpServer } from "@modelcontextprotocol/server";
import { registerRecipeResources } from "./resources.js";
import { registerRecipeTools } from "./tools.js";

export interface RecipesMcpOptions {
  readonly recipes: RecipesService;
  readonly provider?: string;
  readonly version?: string;
}

/** Creates the MCP presentation layer without constructing infrastructure. */
export function createRecipesMcpServer({
  recipes,
  provider = "personal",
  version = "0.1.0",
}: RecipesMcpOptions): McpServer {
  const server = new McpServer({ name: "recipes", version });
  registerRecipeResources(server, recipes, provider);
  registerRecipeTools(server, recipes, provider);
  return server;
}
