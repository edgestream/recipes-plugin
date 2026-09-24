import { createHostedRecipes, createLocalRecipes } from "@edgestream/recipes-runtime";
import { createRecipesMcpServer } from "./createServer.js";
import { createRecipesMcpHttpServer } from "./web.js";
import { IntrospectionVerifier, type VerifiedRecipesPrincipal } from "./auth.js";

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

const defaultHostedCollectionBytes = 2 * 1024 * 1024;

export async function main(): Promise<void> {
  const host = process.env.RECIPES_MCP_HTTP_HOST ?? "127.0.0.1";
  const port = parsePort(process.env.RECIPES_MCP_HTTP_PORT);
  const publicUrl = parsePublicUrl(process.env.RECIPES_MCP_HTTP_PUBLIC_URL, host, port);
  if (!loopbackHosts.has(host) && process.env.RECIPES_MCP_HTTP_ALLOW_REMOTE !== "true") throw new Error("Refusing non-loopback binding. Set RECIPES_MCP_HTTP_ALLOW_REMOTE=true only behind HTTPS and an authenticated proxy or tunnel.");
  if (!loopbackHosts.has(host)) console.error("WARNING: Recipes MCP HTTP is remotely reachable. Use HTTPS and an authenticated reverse proxy or Secure MCP Tunnel.");
  const authentication = hostedAuthentication(process.env);
  if (!loopbackHosts.has(host) && authentication === undefined) throw new Error("Remotely reachable Recipes MCP requires OAuth adapter verifier configuration.");
  const server = createRecipesMcpHttpServer((context) => {
    const principal = context.authInfo?.extra?.recipesPrincipal as VerifiedRecipesPrincipal | undefined;
    const runtime = authentication === undefined || principal === undefined ? createLocalRecipes() : createHostedRecipes({
      dataRoot: authentication.dataRoot,
      principal,
      publicImportHosts: authentication.publicImportHosts,
      maxBytes: authentication.maxBytes,
      maxRequestsPerAccount: authentication.maxRequestsPerAccount,
      maxRequestsGlobal: authentication.maxRequestsGlobal,
      maxConcurrentPerAccount: authentication.maxConcurrentPerAccount,
      maxConcurrentGlobal: authentication.maxConcurrentGlobal,
    });
    return createRecipesMcpServer({ recipes: runtime.recipes, providers: runtime.providers, defaultProvider: runtime.provider });
  }, {
    host, port, allowedHosts: [host, "localhost", "127.0.0.1", "[::1]", ...(authentication === undefined ? [] : [new URL(authentication.resource).host])],
    allowedOrigins: readList(process.env.RECIPES_MCP_HTTP_ALLOWED_ORIGINS, ["localhost", "127.0.0.1", "[::1]"]),
    ...(authentication === undefined ? {} : { authentication }),
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  console.error(`Recipes MCP HTTP server listening at ${publicUrl}`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const forceClose = setTimeout(() => {
      console.error("Recipes MCP HTTP shutdown timed out; closing active connections.");
      server.closeAllConnections();
    }, 10_000);
    forceClose.unref();
    server.close(() => clearTimeout(forceClose));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

function hostedAuthentication(env: NodeJS.ProcessEnv): ({ resource: string; issuer: string; verifier: IntrospectionVerifier; dataRoot: string; publicImportHosts: readonly string[]; maxBytes: number; maxRequestsPerAccount: number; maxRequestsGlobal: number; maxConcurrentPerAccount: number; maxConcurrentGlobal: number }) | undefined {
  const resource = env.RECIPES_MCP_OAUTH_RESOURCE;
  if (resource === undefined) return undefined;
  const issuer = required(env, "RECIPES_MCP_OAUTH_ISSUER");
  const endpoint = required(env, "RECIPES_MCP_INTROSPECTION_URL");
  const clientId = required(env, "RECIPES_MCP_INTROSPECTION_CLIENT_ID");
  const clientSecret = required(env, "RECIPES_MCP_INTROSPECTION_CLIENT_SECRET");
  const dataRoot = required(env, "RECIPES_HOSTED_DATA_ROOT");
  return {
    resource: new URL(resource).href,
    issuer: new URL(issuer).href,
    dataRoot,
    publicImportHosts: readList(env.RECIPES_HOSTED_IMPORT_ALLOWED_HOSTS, []),
    maxBytes: parsePositiveBytes(env.RECIPES_HOSTED_MAX_BYTES),
    maxRequestsPerAccount: parsePositiveBytes(env.RECIPES_HOSTED_MAX_REQUESTS_PER_ACCOUNT ?? "30"),
    maxRequestsGlobal: parsePositiveBytes(env.RECIPES_HOSTED_MAX_REQUESTS_GLOBAL ?? "300"),
    maxConcurrentPerAccount: parsePositiveBytes(env.RECIPES_HOSTED_MAX_CONCURRENT_PER_ACCOUNT ?? "2"),
    maxConcurrentGlobal: parsePositiveBytes(env.RECIPES_HOSTED_MAX_CONCURRENT_GLOBAL ?? "20"),
    verifier: new IntrospectionVerifier({ endpoint, clientId, clientSecret, issuer, resource }),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required when RECIPES_MCP_OAUTH_RESOURCE is set.`);
  return value;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("RECIPES_MCP_HTTP_PORT must be an integer from 1 to 65535.");
  return port;
}
function parsePositiveBytes(value: string | undefined): number {
  if (value === undefined) return defaultHostedCollectionBytes;
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error("RECIPES_HOSTED_MAX_BYTES must be a positive safe integer.");
  return bytes;
}
function parsePublicUrl(value: string | undefined, host: string, port: number): string {
  const candidate = value ?? `http://${host}:${port}/mcp`;
  const url = new URL(candidate);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/mcp" || url.search || url.hash) throw new Error("RECIPES_MCP_HTTP_PUBLIC_URL must be an HTTP(S) URL ending exactly in /mcp.");
  return url.href;
}
function readList(value: string | undefined, fallback: readonly string[]): string[] { return value === undefined ? [...fallback] : value.split(/\s+/).filter(Boolean); }

if (import.meta.main) main().catch((error: unknown) => { console.error("Fatal MCP HTTP server error:", error instanceof Error ? error.message : "Unknown error"); process.exitCode = 1; });
