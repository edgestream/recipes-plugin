import { createLocalRecipes } from "@edgestream/recipes-runtime";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createRecipesMcpServer } from "./createServer.js";

export async function main(): Promise<void> {
  const runtime = createLocalRecipes();
  const server = createRecipesMcpServer(runtime);
  await server.connect(new StdioServerTransport());
  console.error("Recipes MCP server running on stdio.");
}

if (import.meta.main) main().catch((error: unknown) => {
  console.error("Fatal MCP server error:", error);
  process.exitCode = 1;
});
