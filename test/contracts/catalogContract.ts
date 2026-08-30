import assert from "node:assert/strict";
import test from "node:test";
import type { RecipeCatalog, RecipeSearch, RecipeWriter } from "@edgestream/recipes-core";

export interface CatalogHarness {
  readonly catalog: RecipeCatalog;
  readonly search: RecipeSearch;
  readonly writer: RecipeWriter;
  readonly close?: () => Promise<void>;
}

export function catalogContract(name: string, createHarness: () => Promise<CatalogHarness>): void {
  test(`${name} satisfies the recipe catalog contract`, async () => {
    const harness = await createHarness();
    try {
      const first = await harness.writer.create(recipe("First pasta", "https://example.test/first"), { id: "first" });
      await harness.writer.create(recipe("Second soup", "https://example.test/second"), { id: "second" });

      const firstPage = await harness.catalog.list({ limit: 1 });
      assert.equal(firstPage.items.length, 1);
      assert.ok(firstPage.nextCursor);
      const secondPage = await harness.catalog.list({ cursor: firstPage.nextCursor, limit: 1 });
      assert.equal(secondPage.items.length, 1);
      assert.equal(secondPage.nextCursor, undefined);

      const listed = [...firstPage.items, ...secondPage.items];
      for (const summary of listed) assert.ok(await harness.catalog.get(summary.ref));
      assert.equal((await harness.catalog.get(first.ref))?.document.url, "https://example.test/first");

      const search = await harness.search.search({ query: "soup", limit: 10 });
      assert.deepEqual(search.items.map((item) => item.ref.id), ["second"]);
    } finally {
      await harness.close?.();
    }
  });
}

function recipe(name: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    url,
    name,
    description: `${name} description`,
  };
}
