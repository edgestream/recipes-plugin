import assert from "node:assert/strict";
import test from "node:test";
import type { RecipeResolver } from "@edgestream/recipes-core";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { RecipesService, parseRecipeUri, recipeUri, sourceRef } from "../src/index.js";

test("uses read-only catalogs without requiring a writer", async () => {
  const store = new MemoryStore();
  const created = await store.create(recipe("Read only"), { id: "read-only" });
  const recipes = new RecipesService({ catalog: store, search: store });

  assert.equal((await recipes.getRecipe(created.ref))?.document.name, "Read only");
  assert.equal((await recipes.listRecipes()).items[0]?.ref.id, "read-only");
  await assert.rejects(
    recipes.importRecipe({ source: sourceRef("https://example.test/recipe") }),
    /Recipe import is not available/u,
  );
  await assert.rejects(
    recipes.deleteRecipe(created.ref),
    /Recipe deletion is not available/u,
  );
});

test("deletes through a separately configured deleter", async () => {
  const store = new MemoryStore();
  const created = await store.create(recipe("Delete me"), { id: "delete-me" });
  const recipes = new RecipesService({ catalog: store, deleter: store });

  await recipes.deleteRecipe(created.ref);

  assert.equal(await recipes.getRecipe(created.ref), undefined);
});

test("imports through separate resolver and writer ports", async () => {
  const store = new MemoryStore();
  const resolver: RecipeResolver = {
    async resolve(source) {
      return { document: recipe("Imported"), provenance: { source } };
    },
  };
  const recipes = new RecipesService({ catalog: store, search: store, writer: store, resolver });
  const imported = await recipes.importRecipe({ source: sourceRef("https://example.test/imported.json"), id: "imported" });

  assert.deepEqual(imported.ref, { provider: "personal", id: "imported" });
  assert.equal(imported.document.url, "https://example.test/source");
  assert.equal(imported.provenance?.source.value, "https://example.test/imported.json");
});

test("round-trips provider-qualified recipe URIs with encoded ids", () => {
  const ref = { provider: "personal", id: "Family Pasta 100%" };
  const uri = recipeUri(ref);

  assert.equal(uri, "recipes://personal/Family%20Pasta%20100%25");
  assert.deepEqual(parseRecipeUri(uri), ref);
});

function recipe(name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    url: "https://example.test/source",
    name,
    description: `${name} description`,
  };
}
