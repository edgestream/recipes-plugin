import assert from "node:assert/strict";
import test from "node:test";
import { RecipesService } from "@edgestream/recipes-application";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { parseArguments } from "../src/arguments.js";
import { executeCommand } from "../src/commands.js";

test("lists, shows, and deletes recipes through the application service", async () => {
  const store = new MemoryStore();
  await store.create({
    "@type": "Recipe",
    url: "https://example.test/pasta",
    name: "Test pasta",
    description: "Quick pasta",
  }, { id: "test-pasta" });
  const recipes = new RecipesService({ catalog: store, search: store, deleter: store });
  let output = "";
  const writer = { write(value: string) { output += value; } };

  assert.equal(await executeCommand(parseArguments(["list"]), { recipes, provider: "personal" }, writer), 0);
  assert.equal(output, "test-pasta: Test pasta\n");
  output = "";
  await executeCommand(parseArguments(["show", "recipes://personal/test-pasta"]), { recipes, provider: "personal" }, writer);
  assert.equal((JSON.parse(output) as { url?: unknown }).url, "https://example.test/pasta");
  output = "";
  assert.equal(await executeCommand(parseArguments(["delete", "test-pasta"]), { recipes, provider: "personal" }, writer), 0);
  assert.equal(output, "test-pasta\n");
  assert.equal(await recipes.getRecipe({ provider: "personal", id: "test-pasta" }), undefined);
});

test("rejects unknown import options", () => {
  assert.throws(() => parseArguments(["import", "recipe.json", "--unknown", "value"]), /accepts only --id/u);
});

test("rejects delete commands without exactly one recipe reference", () => {
  assert.throws(() => parseArguments(["delete"]), /delete requires one recipe id/u);
  assert.throws(() => parseArguments(["delete", "first", "second"]), /delete requires one recipe id/u);
});
