import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import process from "node:process";

const image = process.argv[2];
const revision = process.argv[3];
if (!image || !revision) throw new Error("Usage: node scripts/container-smoke.mjs <image> <source-revision>");

const name = `recipes-mcp-smoke-${randomUUID()}`;
const volume = `${name}-data`;
let container;
const verifier = createServer((request, response) => {
  if (request.url !== "/token/introspection") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
    active: true, iss: "https://auth.example/", sub: "container-smoke", aud: ["https://recipes.example/mcp"],
    scope: "recipes:read recipes:write", exp: Math.floor(Date.now() / 1_000) + 600,
  }));
});
await new Promise((resolve) => verifier.listen(0, "0.0.0.0", resolve));
const verifierPort = verifier.address().port;

try {
  assert.equal((await docker(["image", "inspect", image, "--format", "{{.Config.User}}"])) .trim(), "node", "the image must run as node");
  assert.equal((await docker(["image", "inspect", image, "--format", "{{index .Config.Labels \"org.opencontainers.image.revision\"}}"])).trim(), revision, "the image revision label must identify its source commit");
  assert.equal((await docker(["image", "inspect", image, "--format", "{{range .Config.Env}}{{println .}}{{end}}"])).includes("RECIPES_MCP_INTROSPECTION_CLIENT_SECRET="), false, "the image must not contain runtime credentials");
  await docker(["volume", "create", volume]);
  container = (await docker([
    "run", "--detach", "--read-only", "--add-host", "host.docker.internal:host-gateway", "--publish", "127.0.0.1::3000", "--volume", `${volume}:/data`, "--name", name,
    "--env", "RECIPES_MCP_HTTP_ALLOW_REMOTE=true",
    "--env", "RECIPES_MCP_OAUTH_RESOURCE=https://recipes.example/mcp",
    "--env", "RECIPES_MCP_OAUTH_ISSUER=https://auth.example/",
    "--env", `RECIPES_MCP_INTROSPECTION_URL=http://host.docker.internal:${verifierPort}/token/introspection`,
    "--env", "RECIPES_MCP_INTROSPECTION_CLIENT_ID=container-smoke",
    "--env", "RECIPES_MCP_INTROSPECTION_CLIENT_SECRET=container-smoke",
    "--env", "RECIPES_HOSTED_DATA_ROOT=/data/users",
    image,
  ])).trim();

  await waitForHealth(container);
  await docker(["exec", container, "sh", "-ec", "test ! -w /app/recipes-mcp-http.mjs && touch /data/write-probe && test -f /data/write-probe"]);

  const port = (await docker(["port", container, "3000/tcp"])).trim().split(":").at(-1);
  assert(port, "Docker did not publish the HTTP port.");
  const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
  const initialize = await mcp(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "recipes-container-smoke", version: "0.1.0" } } });
  assert.equal(initialize.status, 200);
  const tools = await mcp(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual((await mcpJson(tools)).result.tools.map((tool) => tool.name), ["list_recipes", "search_recipes", "get_recipe", "import_recipe", "delete_recipe"]);
  const directImport = await mcp(endpoint, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "import_recipe", arguments: { source: "https://public.example/recipe" } } });
  assert.match(JSON.stringify(await mcpJson(directImport)), /direct URL imports are disabled/u);

  await docker(["kill", "--signal", "SIGTERM", container]);
  await waitForExit(container);
} finally {
  if (container) await docker(["rm", "--force", container]).catch(() => undefined);
  await docker(["volume", "rm", "--force", volume]).catch(() => undefined);
  await new Promise((resolve, reject) => verifier.close((error) => error === undefined ? resolve() : reject(error)));
}

function mcp(endpoint, body) {
  return fetch(endpoint, { method: "POST", headers: { authorization: "Bearer container-smoke", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
}

async function mcpJson(response) {
  const body = await response.text();
  const json = response.headers.get("content-type")?.startsWith("text/event-stream")
    ? body.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6)
    : body;
  if (!json) throw new Error(`MCP response did not include JSON: ${body}`);
  return JSON.parse(json);
}

async function waitForHealth(id) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const status = (await docker(["inspect", "--format", "{{.State.Status}}", id])).trim();
    if (status !== "running") throw new Error(`Container exited before becoming ready: ${await docker(["logs", id])}`);
    const port = (await docker(["port", id, "3000/tcp"])).trim().split(":").at(-1);
    if (port) {
      const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => undefined);
      if (response?.ok) return;
    }
    await delay(200);
  }
  throw new Error(`Container did not become ready: ${await docker(["logs", id])}`);
}

async function waitForExit(id) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await docker(["inspect", "--format", "{{.State.Running}}", id])).trim() === "false") return;
    await delay(200);
  }
  throw new Error("Container did not stop after SIGTERM.");
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`docker ${args.join(" ")} failed (${code}): ${stderr}`)));
  });
}
