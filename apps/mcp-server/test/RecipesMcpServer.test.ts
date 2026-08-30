import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RecipesService } from "@edgestream/recipes-application";
import { UrlSource } from "@edgestream/recipes-source-url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { createRecipesMcpServer } from "../src/index.js";

test("exposes personal resources through transport-neutral use cases", async () => {
  const store = new MemoryStore();
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    url: "https://example.test/tomato-pasta",
    name: "Tomato Pasta",
    description: "A quick tomato pasta.",
    recipeIngredient: ["Tomatoes"],
  };
  await store.create(recipe, { id: "tomato-pasta" });
  await store.create({ ...recipe, url: "https://example.test/tomato-soup", name: "Tomato Soup" }, { id: "tomato-soup" });
  await store.create({ ...recipe, url: "https://example.test/family", name: "Family Pasta" }, { id: "Family Pasta 100%" });
  const recipes = new RecipesService({
    catalog: store,
    search: store,
    writer: store,
    resolver: new UrlSource(),
  });
  const server = createRecipesMcpServer({ recipes });
  const client = new Client({ name: "recipes-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ["search_recipes", "get_recipe", "import_recipe"]);

    const resources = await client.listResources();
    assert.equal(resources.resources[0]?.uri, "recipes://personal");
    assert.equal(resources.resources[0]?.title, "Personal recipe index");
    const templates = await client.listResourceTemplates();
    assert.equal(templates.resourceTemplates[0]?.uriTemplate, "recipes://personal/{id}");

    const firstSearchPage = await client.callTool({
      name: "search_recipes",
      arguments: { query: "tomato", limit: 1 },
    });
    assert.equal(firstSearchPage.content[0]?.type, "resource_link");
    assert.equal(firstSearchPage.content[0]?.uri, "recipes://personal/tomato-pasta");
    assert.deepEqual(firstSearchPage.structuredContent, {
      results: [{
        id: "tomato-pasta",
        name: "Tomato Pasta",
        description: "A quick tomato pasta.",
        uri: "recipes://personal/tomato-pasta",
      }],
      nextCursor: "1",
    });

    const fetched = await client.readResource({ uri: "recipes://personal/tomato-pasta" });
    const content = fetched.contents[0];
    assert.ok(content && "text" in content);
    assert.deepEqual(JSON.parse(content.text), recipe);

    const encoded = await client.readResource({ uri: "recipes://personal/Family%20Pasta%20100%25" });
    const encodedContent = encoded.contents[0];
    assert.ok(encodedContent && "text" in encodedContent);
    assert.equal((JSON.parse(encodedContent.text) as { name?: unknown }).name, "Family Pasta");

    const imported = await client.callTool({
      name: "import_recipe",
      arguments: {
        source: pathToFileURL(fileURLToPath(new URL("../../../examples/spaghetti-carbonara.json", import.meta.url))).href,
      },
    });
    assert.equal(imported.content[0]?.type, "resource_link");
    assert.equal(imported.content[0]?.uri, "recipes://personal/spaghetti-carbonara");
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test("advertises only capabilities configured in the application service", async () => {
  const store = new MemoryStore();
  const server = createRecipesMcpServer({ recipes: new RecipesService({ catalog: store }) });
  const client = new Client({ name: "recipes-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["get_recipe"]);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
