import assert from "node:assert/strict";
import test from "node:test";
import { RecipesService } from "@edgestream/recipes-application";
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
