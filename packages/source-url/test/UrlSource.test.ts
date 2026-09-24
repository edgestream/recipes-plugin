import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { UrlSource } from "../src/index.js";
import { HostedFetchPolicy, isPublicAddress } from "../src/index.js";

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

test("extracts Recipe JSON-LD from the HTML body", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head>
      <script type="application/ld+json">not-json</script>
    </head><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Body recipe"}</script>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const recipe = await new UrlSource().resolve({ value: `http://127.0.0.1:${address.port}/recipe` });
    assert.equal(recipe?.document.name, "Body recipe");
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

test("hosted mode rejects paths, credentials, unsafe protocols and unsafe redirects before fetch", async () => {
  let calls = 0;
  const source = new UrlSource({ hostedPublic: true, allowedHosts: ["public.example"], fetch: async () => { calls++; return new Response("{}", { status: 200 }); } });
  for (const value of ["recipe.json", "file:///etc/passwd", "ftp://public.example/recipe", "https://user:secret@public.example/recipe", "https://127.0.0.1/recipe"]) {
    await assert.rejects(source.resolve({ value }), /allowed public HTTP/u);
  }
  const redirecting = new UrlSource({ hostedPublic: true, allowedHosts: ["public.example"], fetch: async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }) });
  await assert.rejects(redirecting.resolve({ value: "https://public.example/recipe" }), /allowed public HTTP/u);
  assert.equal(calls, 0);
});

test("limits chunked and compressed response data before retaining it", async () => {
  const chunks = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("12345")); controller.enqueue(new TextEncoder().encode("67890")); controller.close(); } });
  const source = new UrlSource({ maxBytes: 8, fetch: async () => new Response(chunks, { headers: { "content-type": "application/json" } }) });
  await assert.rejects(source.resolve({ value: "https://example.test/recipe" }), /byte limit/u);
});

test("enforces decoded compressed limits and request deadlines", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json"); response.setHeader("content-encoding", "gzip");
    response.end(gzipSync('{"@type":"Recipe","name":"this expands beyond the limit"}'));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(new UrlSource({ maxBytes: 12 }).resolve({ value: `http://127.0.0.1:${address.port}/recipe` }), /byte limit/u);
    await assert.rejects(new UrlSource({ timeoutMs: 5, fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timed out")), { once: true })) }).resolve({ value: "https://example.test/recipe" }), /timed out/u);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("classifies internal IPv4, IPv6, mapped IPv6 and metadata addresses as non-public", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1"]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("93.184.216.34"), true);
  const policy = new HostedFetchPolicy({ allowedHosts: ["public.example"], account: `test-${Date.now()}`, maxRequestsPerAccount: 1, lookup: async () => [{ address: "127.0.0.1", family: 4 }] });
  await assert.rejects(policy.fetch("https://public.example/recipe"), /address is not public/u);
});

test("rejects an exhausted hosted request budget before another connection", async () => {
  const policy = new HostedFetchPolicy({ allowedHosts: ["public.example"], account: `budget-${Date.now()}`, maxRequestsPerAccount: 1, lookup: async () => [{ address: "93.184.216.34", family: 4 }], transport: async () => new Response("{}") });
  await policy.fetch("https://public.example/recipe");
  await assert.rejects(policy.fetch("https://public.example/recipe"), /budget exhausted/u);
});

test("enforces hosted concurrency before starting another request and strips credentials", async () => {
  let release: (() => void) | undefined; let authorization: string | null = "unexpected";
  const policy = new HostedFetchPolicy({
    allowedHosts: ["public.example"], account: `concurrent-${Date.now()}`, maxConcurrentPerAccount: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: async (_input, init) => await new Promise<Response>((resolve) => { authorization = new Headers(init?.headers).get("authorization"); release = () => resolve(new Response("{}")); }),
  });
  const first = policy.fetch("https://public.example/recipe", { headers: { authorization: "Bearer never-forward" } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(policy.fetch("https://public.example/other"), /concurrency limit/u);
  release?.(); await first;
  assert.equal(authorization, null);
});
