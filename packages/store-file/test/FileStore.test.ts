import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecipeConflictError, RecipeNotFoundError, UnsupportedRecipeCapabilityError } from "@edgestream/recipes-core";
import { catalogContract } from "../../../test/contracts/catalogContract.js";
import { FileStore } from "../src/index.js";

catalogContract("FileStore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-contract-"));
  const store = new FileStore(directory);
  return {
    catalog: store,
    search: store,
    writer: store,
    close: () => rm(directory, { recursive: true, force: true }),
  };
});

test("persists source recipe data without replacing its schema.org url", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const store = new FileStore(directory);
    const created = await store.create({
      "@type": "Recipe",
      url: "https://example.test/test-recipe",
      name: "Test recipe",
      description: "A test recipe.",
    }, { id: "test-recipe" });

    assert.deepEqual(created.ref, { provider: "personal", id: "test-recipe" });
    assert.equal(created.document.url, "https://example.test/test-recipe");
    assert.equal((await store.get(created.ref))?.document.url, "https://example.test/test-recipe");
    const persisted = JSON.parse(await readFile(join(directory, "test-recipe.json"), "utf8")) as { url?: unknown };
    assert.equal(persisted.url, "https://example.test/test-recipe");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reads a manually copied recipe whose filename needs URI encoding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    await writeFile(join(directory, "Family Pasta 100%.json"), JSON.stringify({
      "@type": "Recipe",
      name: "Copied recipe",
    }));
    const store = new FileStore(directory);
    const page = await store.list();

    assert.deepEqual(page.items[0]?.ref, { provider: "personal", id: "Family Pasta 100%" });
    assert.equal((await store.get({ provider: "personal", id: "Family Pasta 100%" }))?.document.description, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects concurrent creates for the same id atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const store = new FileStore(directory);
    const recipe = { "@type": "Recipe", name: "Concurrent", description: "" };
    const results = await Promise.allSettled([
      store.create(recipe, { id: "concurrent" }),
      store.create(recipe, { id: "concurrent" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.ok(rejection?.reason instanceof RecipeConflictError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deletes only the selected owned recipe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const store = new FileStore(directory);
    const recipe = { "@type": "Recipe", name: "Delete me", description: "" };
    await store.create(recipe, { id: "delete-me" });
    await store.create({ ...recipe, name: "Keep me" }, { id: "keep-me" });

    await store.delete({ provider: "personal", id: "delete-me" });

    assert.equal(await store.get({ provider: "personal", id: "delete-me" }), undefined);
    assert.equal((await store.get({ provider: "personal", id: "keep-me" }))?.document.name, "Keep me");
    await assert.rejects(store.delete({ provider: "personal", id: "delete-me" }), RecipeNotFoundError);
    await assert.rejects(store.delete({ provider: "external", id: "keep-me" }), UnsupportedRecipeCapabilityError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
