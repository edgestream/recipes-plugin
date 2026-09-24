import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "@edgestream/recipes-store-file";
import { createHostedRecipes, createLocalRecipes, localRecipesConfiguration, personalStorageNamespace } from "../src/index.js";

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

test("derives a stable opaque hosted namespace from issuer and subject only", () => {
  const namespace = personalStorageNamespace("https://mcp-auth.example/", "kratos-uuid");
  assert.match(namespace, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(namespace, personalStorageNamespace("https://mcp-auth.example/", "kratos-uuid"));
  assert.notEqual(namespace, personalStorageNamespace("https://mcp-auth.example/", "other-uuid"));
});

test("keeps hosted accounts isolated across restart, relink, profile change, and isolated restore", async () => {
  const root = await mkdtemp(join(tmpdir(), "recipes-hosted-runtime-"));
  const restoredRoot = await mkdtemp(join(tmpdir(), "recipes-hosted-restored-"));
  const issuer = "https://auth.example/";
  const accountA = { issuer, subject: "account-a" };
  const accountB = { issuer, subject: "account-b" };
  try {
    const namespaceA = personalStorageNamespace(accountA.issuer, accountA.subject);
    const namespaceB = personalStorageNamespace(accountB.issuer, accountB.subject);
    const recipe = { "@type": "Recipe", name: "Shared id", description: "" } as const;
    await new FileStore(join(root, namespaceA)).create(recipe, { id: "same-id" });
    await new FileStore(join(root, namespaceB)).create({ ...recipe, name: "Other account" }, { id: "same-id" });

    const restartedA = createHostedRecipes({ dataRoot: root, principal: accountA });
    const relinkedA = createHostedRecipes({ dataRoot: root, principal: { issuer, subject: "account-a" } });
    const profileChangedA = createHostedRecipes({ dataRoot: root, principal: accountA });
    const runtimeB = createHostedRecipes({ dataRoot: root, principal: accountB });

    assert.equal((await restartedA.recipes.getRecipe({ provider: "personal", id: "same-id" }))?.document.name, "Shared id");
    assert.equal((await relinkedA.recipes.listRecipes({ limit: 1 })).items[0]?.name, "Shared id");
    assert.equal((await profileChangedA.recipes.listRecipes()).items[0]?.name, "Shared id");
    assert.equal((await runtimeB.recipes.getRecipe({ provider: "personal", id: "same-id" }))?.document.name, "Other account");

    await cp(join(root, namespaceA), join(restoredRoot, namespaceA), { recursive: true });
    const restoredA = createHostedRecipes({ dataRoot: restoredRoot, principal: accountA });
    assert.equal((await restoredA.recipes.getRecipe({ provider: "personal", id: "same-id" }))?.document.name, "Shared id");
    assert.equal(await restoredA.recipes.getRecipe({ provider: "personal", id: "missing" }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(restoredRoot, { recursive: true, force: true });
  }
});
