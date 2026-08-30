import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { UrlSource } from "../src/index.js";

test("resolves a raw Recipe document from a file URL", async () => {
  const reference = pathToFileURL(fileURLToPath(new URL("./recipe.json", import.meta.url)));
  const result = await new UrlSource().resolve({ value: reference.href });

  assert.equal(result?.document.name, "Pasta al Limone");
  assert.equal(result?.document["@type"], "Recipe");
  assert.equal(result?.provenance.source.value, reference.href);
});

test("resolves a raw Recipe document from an HTTP URL", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/ld+json");
    response.end('{"@type":"Recipe","name":"HTTP recipe"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const recipe = await new UrlSource().resolve({ value: `http://127.0.0.1:${address.port}/recipe.json` });
    assert.equal(recipe?.document.name, "HTTP recipe");
    assert.equal(recipe?.document.description, "");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("extracts Recipe JSON-LD after an unrelated malformed block", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <script type="application/ld+json">not-json</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Recipe","name":"HTML recipe"}]}</script>
    </head><body><h1>Ignored</h1></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const recipe = await new UrlSource().resolve({ value: `http://127.0.0.1:${address.port}/recipe` });
    assert.equal(recipe?.document.name, "HTML recipe");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("returns undefined when an HTTP recipe does not exist", async () => {
  const server = createServer((_request, response) => {
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const recipe = await new UrlSource().resolve({ value: `http://127.0.0.1:${address.port}/missing` });
    assert.equal(recipe, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("rejects documents larger than the configured limit", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end('{"@type":"Recipe","name":"Too large"}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await assert.rejects(
      new UrlSource({ maxBytes: 10 }).resolve({ value: `http://127.0.0.1:${address.port}/recipe` }),
      /byte limit/u,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
