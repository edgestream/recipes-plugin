import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const bundle = fileURLToPath(new URL("../../../dist/recipes-mcp.mjs", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));

test("performs a real stdio handshake with the bundled MCP server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-mcp-bundle-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle],
    cwd: root,
    env: { ...getDefaultEnvironment(), RECIPES_DATA_DIRECTORY: directory },
    stderr: "pipe",
  });
  const client = new Client({ name: "recipes-bundle-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), [
      "search_recipes",
      "get_recipe",
      "import_recipe",
    ]);
    assert.equal((await client.listResources()).resources[0]?.uri, "recipes://personal");
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
