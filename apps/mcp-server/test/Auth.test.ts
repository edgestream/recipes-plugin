import assert from "node:assert/strict";
import test from "node:test";
import { IntrospectionVerifier } from "../src/index.js";

const issuer = "https://recipes-auth.example/";
const resource = "https://recipes.example/mcp";

function verifier(body: unknown, status = 200): IntrospectionVerifier {
  return new IntrospectionVerifier({
    endpoint: "http://adapter.internal/token/introspection",
    clientId: "recipes",
    clientSecret: "secret",
    issuer,
    resource,
    fetch: async () => Response.json(body, { status }),
  });
}

function active(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    active: true,
    iss: issuer,
    sub: "human-account-id",
    aud: [resource],
    scope: "recipes:read",
    exp: Math.floor(Date.now() / 1_000) + 60,
    ...overrides,
  };
}

test("accepts only a current, single-resource adapter access token", async () => {
  const principal = await verifier(active()).verify("opaque-access-token");
  assert.deepEqual(principal, {
    issuer,
    subject: "human-account-id",
    scopes: ["recipes:read"],
    expiresAt: principal.expiresAt,
  });
  assert.ok(principal.expiresAt > Date.now() / 1_000);
});

test("rejects inactive, expired, malformed, wrong-resource, direct-ID, and service-token responses", async () => {
  const cases: unknown[] = [
    active({ active: false }),
    active({ exp: Math.floor(Date.now() / 1_000) - 1 }),
    active({ aud: [resource, "https://other.example/mcp"] }),
    active({ aud: "https://other.example/mcp" }),
    active({ iss: "https://hydra.example/" }),
    active({ sub: "" }),
    active({ token_type: "id_token" }),
    active({ token_type: "client_credentials" }),
    active({ scope: 42 }),
    active({ exp: undefined }),
    { active: true },
  ];
  for (const response of cases) {
    await assert.rejects(verifier(response).verify("untrusted-token"));
  }
});

test("fails closed when introspection is unavailable or times out", async () => {
  await assert.rejects(verifier({}, 503).verify("opaque-access-token"));
  const slow = new IntrospectionVerifier({
    endpoint: "http://adapter.internal/token/introspection",
    clientId: "recipes",
    clientSecret: "secret",
    issuer,
    resource,
    timeoutMs: 5,
    fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    }),
  });
  await assert.rejects(slow.verify("opaque-access-token"));
});
