import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RecipesService } from "@edgestream/recipes-application";
import type { RecipeSearch } from "@edgestream/recipes-core";
import { CombinedCatalog } from "@edgestream/recipes-runtime";
import { UrlSource } from "@edgestream/recipes-source-url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { createRecipesMcpServer } from "../src/index.js";

test("exposes one MCP server with multiple provider-qualified catalogs", async () => {
  const personal = new MemoryStore();
  const external = new MemoryStore("external");
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    url: "https://example.test/tomato-pasta",
    name: "Tomato Pasta",
    description: "A quick tomato pasta.",
    recipeIngredient: ["Tomatoes"],
  };
  await personal.create(recipe, { id: "tomato-pasta" });
  await personal.create({ ...recipe, url: "https://example.test/tomato-soup", name: "Tomato Soup" }, { id: "tomato-soup" });
  await personal.create({ ...recipe, url: "https://example.test/family", name: "Family Pasta" }, { id: "Family Pasta 100%" });
  await external.create(
    { ...recipe, url: "https://external.test/tomato", name: "External Tomato" },
    { id: "external-tomato", provenance: { source: { value: "https://external.test/tomato" } } },
  );
  const externalSearchLimits: Array<number | undefined> = [];
  const externalSearch: RecipeSearch = {
    async search(request, context) {
      context?.signal?.throwIfAborted();
      externalSearchLimits.push(request.limit);
      const page = await external.search(request);
      return {
        ...page,
        items: page.items.map((item) => ({ ...item, importSource: { value: "https://external.test/tomato" } })),
      };
    },
  };
  const combined = new CombinedCatalog(personal, [
    { id: "personal", catalog: personal, search: personal },
    { id: "external", catalog: external, search: externalSearch },
  ]);
  const recipes = new RecipesService({ catalog: combined, search: combined, writer: personal, resolver: new UrlSource() });
  const server = createRecipesMcpServer({
    recipes,
    defaultProvider: "personal",
    providers: [
      { id: "personal", title: "Personal recipes", enumerateResources: true },
      { id: "external", title: "External recipes", enumerateResources: false },
    ],
  });
  const client = new Client({ name: "recipes-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["search_recipes", "get_recipe", "import_recipe"]);
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === "recipes://personal"));
    assert.ok(resources.resources.every((resource) => resource.uri.startsWith("recipes://personal")));
    assert.deepEqual((await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate), [
      "recipes://{provider}/{id}",
    ]);

    await client.callTool({ name: "search_recipes", arguments: { query: "tomato" } });
    assert.deepEqual(externalSearchLimits, [20]);

    const search = await client.callTool({ name: "search_recipes", arguments: { query: "tomato", limit: 1 } });
    assert.deepEqual(externalSearchLimits, [20, 1]);
    assert.deepEqual(search.structuredContent, {
      results: [
        {
          provider: "personal",
          id: "tomato-pasta",
          name: "Tomato Pasta",
          description: "A quick tomato pasta.",
          uri: "recipes://personal/tomato-pasta",
        },
        {
          provider: "external",
          id: "external-tomato",
          name: "External Tomato",
          description: "A quick tomato pasta.",
          importSource: "https://external.test/tomato",
          uri: "recipes://external/external-tomato",
        },
      ],
      nextCursor: null,
    });

    const fetched = await client.readResource({ uri: "recipes://external/external-tomato" });
    const content = fetched.contents[0];
    assert.ok(content && "text" in content);
    assert.equal((JSON.parse(content.text) as { name?: unknown }).name, "External Tomato");

    const viaTool = await client.callTool({ name: "get_recipe", arguments: { provider: "external", id: "external-tomato" } });
    assert.equal(viaTool.isError, undefined);
    assert.equal((viaTool.structuredContent as { provider?: unknown }).provider, "external");

    const encoded = await client.readResource({ uri: "recipes://personal/Family%20Pasta%20100%25" });
    const encodedContent = encoded.contents[0];
    assert.ok(encodedContent && "text" in encodedContent);
    assert.equal((JSON.parse(encodedContent.text) as { name?: unknown }).name, "Family Pasta");

    const imported = await client.callTool({
      name: "import_recipe",
      arguments: { source: pathToFileURL(fileURLToPath(new URL("../../../examples/spaghetti-carbonara.json", import.meta.url))).href },
    });
    const importedContent = imported.content[0];
    assert.ok(importedContent && importedContent.type === "resource_link");
    assert.equal(importedContent.uri, "recipes://personal/spaghetti-carbonara");

    const importedReference = await client.callTool({
      name: "import_recipe",
      arguments: { source: "recipes://external/external-tomato" },
    });
    const importedReferenceContent = importedReference.content[0];
    assert.ok(importedReferenceContent && importedReferenceContent.type === "resource_link");
    assert.equal(importedReferenceContent.uri, "recipes://personal/tomato");
    assert.equal((await personal.get({ provider: "personal", id: "tomato" }))?.provenance?.source.value, "https://external.test/tomato");
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});

test("advertises only capabilities configured in the application service", async () => {
  const store = new MemoryStore();
  const server = createRecipesMcpServer({
    recipes: new RecipesService({ catalog: store }),
    defaultProvider: "test",
    providers: [{ id: "test", title: "Test recipes", enumerateResources: false }],
  });
  const client = new Client({ name: "recipes-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["get_recipe"]);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
});
