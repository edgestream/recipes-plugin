import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "../../../test/support/MemoryStore.js";
import { CombinedCatalog } from "../src/index.js";

test("routes reads and combines searches without coupling providers", async () => {
  const personal = new MemoryStore("personal");
  const external = new MemoryStore("external");
  await personal.create(recipe("Personal soup"), { id: "personal-soup" });
  await external.create(recipe("External soup"), { id: "external-soup" });
  const catalog = new CombinedCatalog(personal, [
    { id: "personal", catalog: personal, search: personal },
    { id: "external", catalog: external, search: external },
  ]);

  assert.deepEqual((await catalog.list()).items.map((item) => item.ref), [{ provider: "personal", id: "personal-soup" }]);
  assert.deepEqual((await catalog.search({ query: "soup", limit: 10 })).items.map((item) => item.ref), [
    { provider: "personal", id: "personal-soup" },
    { provider: "external", id: "external-soup" },
  ]);
  assert.equal((await catalog.get({ provider: "external", id: "external-soup" }))?.document.name, "External soup");
  assert.equal(await catalog.get({ provider: "unknown", id: "missing" }), undefined);
  await assert.rejects(catalog.search({ query: "soup", cursor: "unsupported" }), /does not support cursors/u);
});

test("rejects duplicate provider ids", () => {
  const store = new MemoryStore();
  assert.throws(
    () => new CombinedCatalog(store, [
      { id: "personal", catalog: store, search: store },
      { id: "personal", catalog: store, search: store },
    ]),
    /must be unique/u,
  );
});

function recipe(name: string) {
  return { "@context": "https://schema.org", "@type": "Recipe", name, description: `${name} description` };
}
