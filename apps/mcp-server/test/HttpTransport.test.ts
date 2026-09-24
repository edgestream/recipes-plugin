import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RecipesService } from "@edgestream/recipes-application";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createHostedRecipes, personalStorageNamespace } from "@edgestream/recipes-runtime";
import { FileStore } from "@edgestream/recipes-store-file";
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
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
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

    const writeRequired = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer read-token", "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "import_recipe", arguments: { source: "https://fixture.example/recipe" } } }),
    });
    assert.equal(writeRequired.status, 403);
    assert.match(writeRequired.headers.get("www-authenticate") ?? "", /scope="recipes:write"/u);

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

test("scopes hosted HTTP tools, resources, cursors, and records to each verified principal", async () => {
  const root = await mkdtemp(join(tmpdir(), "recipes-http-identities-"));
  const issuer = "https://auth.example/";
  const principalA = { issuer, subject: "account-a" };
  const principalB = { issuer, subject: "account-b" };
  const recipe = { "@type": "Recipe", description: "" };
  await new FileStore(join(root, personalStorageNamespace(issuer, principalA.subject))).create({ ...recipe, name: "Account A" }, { id: "same-id" });
  await new FileStore(join(root, personalStorageNamespace(issuer, principalB.subject))).create({ ...recipe, name: "Account B" }, { id: "same-id" });
  const verifier: RecipesTokenVerifier = {
    async verify(token) {
      return { ...(token === "a" ? principalA : principalB), scopes: ["recipes:read"], expiresAt: Math.floor(Date.now() / 1_000) + 60 };
    },
  };
  const server = createRecipesMcpHttpServer((context) => {
    const principal = context.authInfo?.extra?.recipesPrincipal as typeof principalA;
    const runtime = createHostedRecipes({ dataRoot: root, principal });
    return createRecipesMcpServer({ recipes: runtime.recipes, providers: runtime.providers, defaultProvider: runtime.provider });
  }, {
    host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1", "localhost"], allowedOrigins: [],
    authentication: { resource: "https://recipes.example/mcp", issuer, verifier },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const endpoint = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  try {
    for (const [token, expected, unexpected] of [["a", "Account A", "Account B"], ["b", "Account B", "Account A"]] as const) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "recipes://personal/same-id" } }),
      });
      assert.equal(response.status, 200);
      const payload = await response.text();
      assert.match(payload, new RegExp(expected, "u"));
      assert.doesNotMatch(payload, new RegExp(unexpected, "u"));
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed before creating a hosted runtime and ignores forged identity and proxy headers", async () => {
  let factoryCalls = 0;
  let verifierCalls = 0;
  const verifier: RecipesTokenVerifier = {
    async verify(token) {
      verifierCalls++;
      if (token === "revoked" || token === "unavailable" || token === "not-a-real-token") throw new Error("not active");
      return {
        issuer: "https://auth.example/",
        subject: token === "expired" ? "account-a" : "account-b",
        scopes: ["recipes:read", "recipes:write"],
        expiresAt: token === "expired" ? Math.floor(Date.now() / 1_000) - 1 : Math.floor(Date.now() / 1_000) + 60,
      };
    },
  };
  const server = createRecipesMcpHttpServer(() => {
    factoryCalls++;
    const recipes = new RecipesService({ catalog: new MemoryStore() });
    return createRecipesMcpServer({
      recipes,
      providers: [{ id: "personal", title: "Personal recipes", enumerateResources: true }],
      defaultProvider: "personal",
    });
  }, {
    host: "127.0.0.1",
    port: 0,
    allowedHosts: ["127.0.0.1", "localhost"],
    allowedOrigins: ["trusted.example"],
    authentication: { resource: "https://recipes.example/mcp", issuer: "https://auth.example/", verifier },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/list", params: {} });
  try {
    for (const headers of [
      { "content-type": "application/json" },
      { authorization: "Bearer expired", "content-type": "application/json" },
      { authorization: "Bearer revoked", "content-type": "application/json" },
      { authorization: "Bearer unavailable", "content-type": "application/json" },
      { authorization: "Bearer not-a-real-token", "x-recipes-subject": "account-a", "x-forwarded-user": "account-a", "content-type": "application/json" },
    ]) {
      const response = await fetch(endpoint, { method: "POST", headers, body: list });
      assert.equal(response.status, 401);
      assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/recipes\.example\/.well-known\/oauth-protected-resource"/u);
    }
    assert.equal(factoryCalls, 0);
    assert.equal(verifierCalls, 4);

    const spoofedProxy = await fetch(endpoint, {
      method: "POST",
      headers: { host: "attacker.example", "x-forwarded-host": "127.0.0.1", "x-forwarded-proto": "https", "content-type": "application/json" },
      body: list,
    });
    assert.notEqual(spoofedProxy.status, 200);
    assert.equal(factoryCalls, 0);

    const wrongOrigin = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer account-b", origin: "https://attacker.example", "content-type": "application/json" },
      body: list,
    });
    assert.notEqual(wrongOrigin.status, 200);
    assert.equal(factoryCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

test("publishes protected-resource metadata and keeps only initialization and schemas public", async () => {
  let verifierCalls = 0;
  const verifier: RecipesTokenVerifier = {
    async verify() {
      verifierCalls++;
      return { issuer: "https://auth.example/", subject: "account", scopes: ["recipes:read"], expiresAt: Math.floor(Date.now() / 1_000) + 60 };
    },
  };
  const recipes = new RecipesService({ catalog: new MemoryStore() });
  const server = createRecipesMcpHttpServer(() => createRecipesMcpServer({
    recipes,
    providers: [{ id: "personal", title: "Personal recipes", enumerateResources: true }],
    defaultProvider: "personal",
  }), {
    host: "127.0.0.1", port: 0, allowedHosts: ["127.0.0.1", "localhost"], allowedOrigins: [],
    authentication: { resource: "https://recipes.example/mcp", issuer: "https://auth.example/", verifier },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    for (const suffix of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const response = await fetch(`${origin}${suffix}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        resource: "https://recipes.example/mcp",
        authorization_servers: ["https://auth.example/"],
        scopes_supported: ["recipes:read", "recipes:write"],
      });
    }
    const schemas = await fetch(`${origin}/mcp`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(schemas.status, 200);
    assert.equal(verifierCalls, 0);
    const resourceEnumeration = await fetch(`${origin}/mcp`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/list", params: {} }),
    });
    assert.equal(resourceEnumeration.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});
