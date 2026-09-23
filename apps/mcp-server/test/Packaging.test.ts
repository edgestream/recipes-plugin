import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const bundle = fileURLToPath(new URL("../../../dist/recipes-mcp.mjs", import.meta.url));
const httpBundle = fileURLToPath(new URL("../../../dist/recipes-mcp-http.mjs", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));

type PluginMcpManifest = {
  mcpServers: {
    recipes: {
      command: string;
      args: string[];
      env: Record<string, string>;
      cwd?: unknown;
    };
  };
};

test("keeps the portable and Codex MCP launch configuration synchronized", async () => {
  const portable = JSON.parse(await readFile(join(root, "mcp.json"), "utf8")) as {
    mcpServers: PluginMcpManifest["mcpServers"];
  };
  const codex = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8")) as PluginMcpManifest;

  assert.deepEqual(portable.mcpServers.recipes.env, {
    RECIPES_DATA_DIRECTORY: "${PLUGIN_DATA}",
  });
  assert.deepEqual(codex.mcpServers.recipes.env, portable.mcpServers.recipes.env);
  for (const manifest of [portable, codex]) {
    assert.equal(manifest.mcpServers.recipes.command, "node");
    assert.deepEqual(manifest.mcpServers.recipes.args, ["./dist/recipes-mcp.mjs"]);
    assert.equal("cwd" in manifest.mcpServers.recipes, false);
  }
});

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
      "list_recipes",
      "search_recipes",
      "get_recipe",
      "import_recipe",
      "delete_recipe",
    ]);
    assert.equal((await client.listResources()).resources[0]?.uri, "recipes://personal");
    assert.deepEqual(
      (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate),
      ["recipes://{provider}/{id}"],
    );
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("performs a real HTTP handshake with the bundled MCP server", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-mcp-http-bundle-"));
  const port = await freePort();
  const child = spawn(process.execPath, [httpBundle], {
    cwd: root,
    env: { ...getDefaultEnvironment(), RECIPES_DATA_DIRECTORY: directory, RECIPES_MCP_HTTP_PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const ready = waitForListening(child, 10_000);
  const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
  const client = new Client({ name: "recipes-http-bundle-test", version: "0.1.0" });
  try {
    await ready;
    await client.connect(new StreamableHTTPClientTransport(endpoint));
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["list_recipes", "search_recipes", "get_recipe", "import_recipe", "delete_recipe"]);
  } finally {
    await client.close().catch(() => undefined);
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return port;
}

function waitForListening(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The bundled HTTP MCP server did not start.")), timeoutMs);
    child.once("error", reject);
    child.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("listening at")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`The bundled HTTP MCP server exited before listening (${code ?? "signal"}).`));
    });
  });
}
