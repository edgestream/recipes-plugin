import assert from "node:assert/strict";
import test from "node:test";
import { createLocalRecipes, localRecipesConfiguration } from "../src/index.js";

test("reads the default provider and additional provider list once for both frontends", () => {
  assert.deepEqual(localRecipesConfiguration({
    RECIPES_DATA_DIRECTORY: "/tmp/recipes-runtime-test",
    RECIPES_PROVIDER: "personal",
    RECIPES_PROVIDERS: "chefkoch",
  }), {
    dataDirectory: "/tmp/recipes-runtime-test",
    provider: "personal",
    providers: ["chefkoch"],
  });
});

test("uses every registered provider when RECIPES_PROVIDERS is not set", () => {
  assert.deepEqual(localRecipesConfiguration({
    RECIPES_DATA_DIRECTORY: "/tmp/recipes-runtime-test",
  }), {
    dataDirectory: "/tmp/recipes-runtime-test",
    provider: "personal",
    providers: undefined,
  });

  const runtime = createLocalRecipes({
    dataDirectory: "/tmp/recipes-runtime-test",
    provider: "personal",
    providers: undefined,
  });
  assert.deepEqual(runtime.providers.map((provider) => provider.id), ["personal", "chefkoch"]);
});

test("treats an explicitly empty provider selection as no additional providers", () => {
  assert.deepEqual(localRecipesConfiguration({ RECIPES_PROVIDERS: "  " }).providers, []);
});

test("rejects duplicate additional providers", () => {
  assert.throws(
    () => localRecipesConfiguration({ RECIPES_PROVIDERS: "chefkoch chefkoch" }),
    /duplicate provider ids/u,
  );
});

test("constructs registered additional providers without coupling frontends to them", () => {
  const runtime = createLocalRecipes({
    dataDirectory: "/tmp/recipes-runtime-test",
    provider: "personal",
    providers: ["chefkoch"],
  });

  assert.deepEqual(runtime.providers.map((provider) => ({
    id: provider.id,
    enumerateResources: provider.enumerateResources,
  })), [
    { id: "personal", enumerateResources: true },
    { id: "chefkoch", enumerateResources: false },
  ]);
});

test("rejects an enabled provider absent from the registry", () => {
  assert.throws(
    () => createLocalRecipes({ providers: ["missing"] }),
    /is not registered/u,
  );
});
