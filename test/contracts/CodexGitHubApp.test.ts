import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import test from "node:test";
import { createAppJwt, parseArguments } from "../../scripts/codex-github-app.mjs";

test("creates a short-lived RS256 GitHub App JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const token = createAppJwt("4803359", privateKeyPem, 1_700_000_000_000);
  const [header, payload, signature] = token.split(".");
  assert.ok(header);
  assert.ok(payload);
  assert.ok(signature);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, "base64url")), true);
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), {
    iat: 1_699_999_970,
    exp: 1_700_000_510,
    iss: "4803359"
  });
});

test("parses an explicitly separated child command", () => {
  assert.deepEqual(parseArguments(["exec", "--repo", "edgestream/recipes-plugin", "--", "gh", "issue", "list"]), {
    command: "exec",
    repo: "edgestream/recipes-plugin",
    child: ["gh", "issue", "list"]
  });
  assert.throws(() => parseArguments(["preflight", "--unexpected"]), /Unknown option/);
});
