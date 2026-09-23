import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { RecipesService } from "@edgestream/recipes-application";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { createRecipesMcpHttpServer, createRecipesMcpServer, type RecipesTokenVerifier } from "../src/index.js";

test("serves the existing Recipes MCP surface through Streamable HTTP", async () => {
  const store = new MemoryStore();
  await store.create({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Tomato Pasta",
    description: "A simple pasta recipe.",
    recipeIngredient: ["Tomatoes"],
  }, { id: "tomato-pasta" });
  const recipes = new RecipesService({ catalog: store, search: store, writer: store, deleter: store });
  const server = createRecipesMcpHttpServer(() => createRecipesMcpServer({
    recipes,
    providers: [{ id: "personal", title: "Personal recipes", enumerateResources: true }],
    defaultProvider: "personal",
  }), {
    host: "127.0.0.1",
    port: 0,
    allowedHosts: ["127.0.0.1", "localhost"],
    allowedOrigins: [],
    bodyLimit: 1024,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const client = new Client({ name: "recipes-http-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(endpoint);
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["list_recipes", "search_recipes", "get_recipe", "import_recipe", "delete_recipe"]);
    assert.equal((await client.listResources()).resources[0]?.uri, "recipes://personal");
    assert.deepEqual((await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate), ["recipes://{provider}/{id}"]);
    const result = await client.callTool({ name: "get_recipe", arguments: { provider: "personal", id: "tomato-pasta" } });
    assert.equal(result.isError, undefined);
    const resource = await client.readResource({ uri: "recipes://personal/tomato-pasta" });
    assert.equal(resource.contents.length, 1);

    const health = await fetch(new URL("/health", endpoint));
    assert.deepEqual(await health.json(), { status: "ok" });
    const oversized = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "content-length": "1025" }, body: "x".repeat(1025) });
    assert.equal(oversized.status, 413);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

test("requires recipes:read for hosted personal listing", async () => {
  const store = new MemoryStore();
  const recipes = new RecipesService({ catalog: store });
  const verifier: RecipesTokenVerifier = {
    async verify(token) {
      return {
        issuer: "https://auth.example/",
        subject: token,
        scopes: token === "read-token" ? ["recipes:read"] : ["recipes:write"],
      };
    },
  };
  const server = createRecipesMcpHttpServer(() => createRecipesMcpServer({
    recipes,
    providers: [{ id: "personal", title: "Personal recipes", enumerateResources: true }],
    defaultProvider: "personal",
  }), {
    host: "127.0.0.1",
    port: 0,
    allowedHosts: ["127.0.0.1", "localhost"],
    allowedOrigins: [],
    authentication: { resource: "https://recipes.example/mcp", issuer: "https://auth.example/", verifier },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_recipes", arguments: {} } });
  try {
    const insufficient = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer write-token", "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: request,
    });
    assert.equal(insufficient.status, 403);
    assert.match(insufficient.headers.get("www-authenticate") ?? "", /scope="recipes:read"/u);

    const listed = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer read-token", "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: request,
    });
    assert.equal(listed.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});
