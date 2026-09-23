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

test("enforces a collection quota while concurrent writes remain atomic", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const store = new FileStore(directory, "personal", { maxBytes: 110 });
    const recipe = { "@type": "Recipe", name: "A", description: "" };
    const results = await Promise.allSettled([store.create(recipe, { id: "one" }), store.create(recipe, { id: "two" })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const files = await store.list();
    assert.equal(files.items.length, 1);
    const persisted = await readFile(join(directory, `${files.items[0]!.ref.id}.json`), "utf8");
    assert.doesNotThrow(() => JSON.parse(persisted));
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

test("makes hosted-style automatic imports idempotent by canonical source across concurrent requests and restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const recipe = { "@type": "Recipe", name: "Idempotent", description: "" };
    const provenance = { source: { value: "https://EXAMPLE.test:443/recipes/one" } };
    const firstStore = new FileStore(directory, "personal", { idempotentSourceImports: true });
    const first = await firstStore.create(recipe, { provenance });
    const restartedStore = new FileStore(directory, "personal", { idempotentSourceImports: true });
    const imports = await Promise.all([
      restartedStore.create(recipe, { provenance: { source: { value: "https://example.test/recipes/one" } } }),
      new FileStore(directory, "personal", { idempotentSourceImports: true }).create(recipe, { provenance }),
    ]);

    assert.deepEqual(imports.map((record) => record.ref), [first.ref, first.ref]);
    assert.equal((await restartedStore.list()).items.length, 1);
    assert.equal((await restartedStore.get(first.ref))?.provenance?.source.value, provenance.source.value);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps distinct sources and collections separate when hosted source idempotency is enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const recipe = { "@type": "Recipe", name: "Separate", description: "" };
    const firstAccount = new FileStore(join(root, "account-a"), "personal", { idempotentSourceImports: true });
    const secondAccount = new FileStore(join(root, "account-b"), "personal", { idempotentSourceImports: true });
    const source = { provenance: { source: { value: "https://example.test/recipes/one" } } };

    const a = await firstAccount.create(recipe, source);
    const b = await secondAccount.create(recipe, source);
    const another = await firstAccount.create(recipe, { provenance: { source: { value: "https://example.test/recipes/two" } } });

    assert.deepEqual(a.ref, b.ref);
    assert.notEqual(another.ref.id, a.ref.id);
    assert.equal((await firstAccount.list()).items.length, 2);
    assert.equal((await secondAccount.list()).items.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("treats explicit ids as intentional creates and permits re-import after deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-store-"));
  try {
    const store = new FileStore(directory, "personal", { idempotentSourceImports: true });
    const recipe = { "@type": "Recipe", name: "Explicit", description: "" };
    const options = { provenance: { source: { value: "https://example.test/recipes/explicit" } } };
    const automatic = await store.create(recipe, options);

    await assert.rejects(store.create(recipe, { ...options, id: automatic.ref.id }), RecipeConflictError);
    const explicit = await store.create(recipe, { ...options, id: "intentional-copy" });
    assert.equal(explicit.ref.id, "intentional-copy");
    await store.delete(automatic.ref);
    await store.delete(explicit.ref);
    const reimported = await store.create(recipe, options);

    assert.equal(reimported.ref.id, automatic.ref.id);
    assert.equal((await store.list()).items.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
