import assert from "node:assert/strict";
import test from "node:test";
import { RecipesService } from "@edgestream/recipes-application";
import { CombinedCatalog } from "@edgestream/recipes-runtime";
import type { RecipeSearch } from "@edgestream/recipes-core";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { parseArguments } from "../src/arguments.js";
import { executeCommand } from "../src/commands.js";

test("lists and shows recipes through the application service", async () => {
  const store = new MemoryStore();
  await store.create({
    "@type": "Recipe",
    url: "https://example.test/pasta",
    name: "Test pasta",
    description: "Quick pasta",
  }, { id: "test-pasta" });
  const recipes = new RecipesService({ catalog: store, search: store });
  let output = "";
  const writer = { write(value: string) { output += value; } };

  assert.equal(await executeCommand(parseArguments(["list"]), { recipes, provider: "personal" }, writer), 0);
  assert.equal(output, "test-pasta: Test pasta\n");
  output = "";
  await executeCommand(parseArguments(["show", "recipes://personal/test-pasta"]), { recipes, provider: "personal" }, writer);
  assert.equal((JSON.parse(output) as { url?: unknown }).url, "https://example.test/pasta");
});

test("rejects unknown import options", () => {
  assert.throws(() => parseArguments(["import", "recipe.json", "--unknown", "value"]), /accepts only --id/u);
});

test("returns the first 20 CLI search results", async () => {
  const store = new MemoryStore();
  for (let index = 1; index <= 21; index += 1) {
    await store.create({
      "@type": "Recipe",
      url: `https://example.test/soup-${index}`,
      name: `Soup ${index}`,
      description: "",
    }, { id: `soup-${index}` });
  }
  const recipes = new RecipesService({ catalog: store, search: store });
  let output = "";
  const writer = { write(value: string) { output += value; } };

  await executeCommand(parseArguments(["search", "soup"]), { recipes, provider: "personal" }, writer);

  const results = output.trim().split("\n");
  assert.equal(results.length, 20);
  assert.ok(results.every((result) => result.startsWith("recipes://personal/soup-")));
});

test("prints provider recipe URIs without source URLs and imports them", async () => {
  const personal = new MemoryStore();
  const external = new MemoryStore("external");
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    url: "https://external.test/tomato-pasta",
    name: "External Tomato Pasta",
    description: "A quick tomato pasta.",
  };
  await external.create(recipe, {
    id: "tomato-pasta",
    provenance: { source: { value: "https://external.test/tomato-pasta" } },
  });
  const externalSearch: RecipeSearch = {
    async search(request, context) {
      context?.signal?.throwIfAborted();
      const page = await external.search(request);
      return { ...page, items: page.items.map((item) => ({ ...item, importSource: { value: "https://external.test/tomato-pasta" } })) };
    },
  };
  const catalog = new CombinedCatalog(personal, [
    { id: "personal", catalog: personal, search: personal },
    { id: "external", catalog: external, search: externalSearch },
  ]);
  const recipes = new RecipesService({ catalog, search: catalog, writer: personal });
  let output = "";
  const writer = { write(value: string) { output += value; } };

  await executeCommand(parseArguments(["search", "tomato"]), { recipes, provider: "personal" }, writer);
  assert.equal(output, "recipes://external/tomato-pasta: External Tomato Pasta\n");
  output = "";

  await executeCommand(parseArguments(["import", "recipes://external/tomato-pasta"]), { recipes, provider: "personal" }, writer);
  assert.equal(output, "tomato-pasta\n");
  assert.equal((await personal.get({ provider: "personal", id: "tomato-pasta" }))?.provenance?.source.value, "https://external.test/tomato-pasta");
});
