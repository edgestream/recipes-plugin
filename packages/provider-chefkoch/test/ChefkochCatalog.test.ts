import assert from "node:assert/strict";
import test from "node:test";
import type { RecipeResolver, SourceRef } from "@edgestream/recipes-core";
import { ChefkochCatalog } from "../src/index.js";

test("maps search-gateway results to readable Chefkoch references and import sources", async () => {
  const requests: URL[] = [];
  const catalog = new ChefkochCatalog({
    resolver: resolver(),
    fetch: async (input) => {
      requests.push(new URL(input.toString()));
      return jsonResponse({
        count: 2,
        offset: null,
        results: [{
          score: 1,
          recipe: {
            id: "1298241234947062",
            title: "Carbonara wie bei der Mamma in Rom",
            siteUrl: "https://www.chefkoch.de/rezepte/1298241234947062/Carbonara-wie-bei-der-Mamma-in-Rom.html",
          },
        }],
      });
    },
  });

  const page = await catalog.search({ query: "Carbonara", limit: 1 });

  assert.deepEqual(page.items, [{
    ref: { provider: "chefkoch", id: "1298241234947062" },
    name: "Carbonara wie bei der Mamma in Rom",
    description: "",
    importSource: { value: "https://www.chefkoch.de/rezepte/1298241234947062/Carbonara-wie-bei-der-Mamma-in-Rom.html" },
  }]);
  assert.equal(page.nextCursor, "chefkoch:1");
  assert.equal(requests[0]?.href, "https://api.chefkoch.de/v2/search-gateway/recipes?query=Carbonara&limit=1&offset=0");
});

test("resolves a numeric recipe reference through its canonical Chefkoch page", async () => {
  const requestedSources: SourceRef[] = [];
  const catalog = new ChefkochCatalog({ resolver: resolver(requestedSources) });

  const recipe = await catalog.get({ provider: "chefkoch", id: "1298241234947062" });

  assert.equal(recipe?.document.name, "Resolved Chefkoch recipe");
  assert.deepEqual(requestedSources, [{ value: "https://www.chefkoch.de/rezepte/1298241234947062/" }]);
  assert.equal(await catalog.get({ provider: "other", id: "1298241234947062" }), undefined);
  await assert.rejects(catalog.get({ provider: "chefkoch", id: "not-a-number" }), /decimal numbers/u);
});

test("accepts the canonical url field when a result has no siteUrl", async () => {
  const catalog = new ChefkochCatalog({
    resolver: resolver(),
    fetch: async () => jsonResponse({
      count: 1,
      results: [{ recipe: {
        id: "123",
        name: "Fallback URL recipe",
        url: "https://www.chefkoch.de/rezepte/123/Fallback-URL-recipe.html",
      } }],
    }),
  });

  const page = await catalog.search({ query: "fallback" });

  assert.equal(page.items[0]?.importSource?.value, "https://www.chefkoch.de/rezepte/123/Fallback-URL-recipe.html");
});

test("rejects malformed search gateway data instead of emitting an unsafe import URL", async () => {
  const catalog = new ChefkochCatalog({
    resolver: resolver(),
    fetch: async () => jsonResponse({
      count: 1,
      results: [{ recipe: { id: "123", title: "Unsafe", siteUrl: "https://example.test/rezepte/123/Unsafe.html" } }],
    }),
  });

  await assert.rejects(catalog.search({ query: "unsafe" }), /canonical Chefkoch recipe URLs/u);
});

function resolver(requestedSources: SourceRef[] = []): RecipeResolver {
  return {
    async resolve(source) {
      requestedSources.push(source);
      return {
        document: { "@type": "Recipe", name: "Resolved Chefkoch recipe", description: "A fixture recipe." },
        provenance: { source },
      };
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}
