import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse, type McpServerFactory } from "@modelcontextprotocol/server";
import type { RecipesTokenVerifier, VerifiedRecipesPrincipal } from "./auth.js";

const defaultBodyLimit = 1_048_576;

export interface RecipesMcpHttpOptions {
  readonly host: string;
  readonly port: number;
  readonly path?: string;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly bodyLimit?: number;
  readonly authentication?: {
    readonly resource: string;
    readonly issuer: string;
    readonly verifier: RecipesTokenVerifier;
  };
}

/** Creates the transport-specific HTTP listener around an existing MCP server factory. */
export function createRecipesMcpHttpServer(factory: McpServerFactory, options: RecipesMcpHttpOptions): Server {
  const path = options.path ?? "/mcp";
  const bodyLimit = options.bodyLimit ?? defaultBodyLimit;
  const handler = createMcpHandler(factory, {
    responseMode: "auto",
    onerror(error) {
      console.error(`Recipes MCP HTTP request failed: ${safeErrorMessage(error)}`);
    },
  });
  const server = createServer(async (request, response) => {
    try {
      if ((request.url ?? "").split("?", 1)[0] === "/health") {
        writeResponse(response, new Response(JSON.stringify({ status: "ok" }), { headers: { "content-type": "application/json; charset=utf-8" } }));
        return;
      }
      if (isProtectedResourceMetadataRequest(request.url, options.path ?? "/mcp") && options.authentication) {
        writeResponse(response, protectedResourceMetadataResponse(request, options.authentication));
        return;
      }
      if ((request.url ?? "").split("?", 1)[0] !== path) {
        writeResponse(response, new Response("Not found.", { status: 404 }));
        return;
      }
      if (contentLengthExceeds(request, bodyLimit)) {
        writeResponse(response, new Response("Request body too large.", { status: 413 }));
        return;
      }
      const abortController = new AbortController();
      request.once("aborted", () => abortController.abort());
      response.once("close", () => { if (!response.writableEnded) abortController.abort(); });
      const webRequest = toWebRequest(request, abortController.signal, bodyLimit);
      const rejected = hostHeaderValidationResponse(webRequest, [...options.allowedHosts]) ?? originValidationResponse(webRequest, [...options.allowedOrigins]);
      if (rejected) return void await writeResponse(response, rejected);
      const auth = options.authentication === undefined ? undefined : await authenticate(webRequest, options.authentication);
      await writeResponse(response, auth instanceof Response ? auth : await handler.fetch(webRequest, auth === undefined ? undefined : { authInfo: auth }));
    } catch (error) {
      console.error(`Recipes MCP HTTP request failed: ${safeErrorMessage(error)}`);
      if (!response.headersSent) writeResponse(response, new Response("Internal server error.", { status: 500 }));
      else response.destroy();
    }
  });
  server.once("close", () => void handler.close().catch(() => undefined));
  return server;
}

async function authenticate(request: Request, authentication: NonNullable<RecipesMcpHttpOptions["authentication"]>) {
  const body = await request.clone().json().catch(() => undefined) as { method?: unknown; params?: { name?: unknown } } | undefined;
  if (body?.method === "initialize" || body?.method === "tools/list") return undefined;
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return challenge(authentication.resource);
  let principal: VerifiedRecipesPrincipal;
  try { principal = await authentication.verifier.verify(token, request.signal); }
  catch { return challenge(authentication.resource); }
  if (!validPrincipal(principal, authentication.issuer)) return challenge(authentication.resource);
  const requiredScope = body?.method === "tools/call" && (body.params?.name === "import_recipe" || body.params?.name === "delete_recipe") ? "recipes:write" : "recipes:read";
  if (!principal.scopes.includes(requiredScope)) return new Response("Insufficient scope.", { status: 403, headers: { "www-authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(authentication.resource)}", error="insufficient_scope", scope="${requiredScope}"` } });
  return {
    token,
    clientId: "recipes-oauth-client",
    scopes: [...principal.scopes],
    resource: new URL(authentication.resource),
    extra: { recipesPrincipal: principal },
  };
}

function bearerToken(value: string | null): string | undefined {
  const match = /^Bearer ([^\s]+)$/u.exec(value ?? "");
  return match?.[1];
}

function challenge(resource: string): Response {
  return new Response("Authentication required.", { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(resource)}", error="invalid_token"` } });
}

function protectedResourceMetadataUrl(resource: string): string {
  const url = new URL(resource);
  return new URL("/.well-known/oauth-protected-resource", url.origin).href;
}

function validPrincipal(value: VerifiedRecipesPrincipal, issuer: string): boolean {
  return value.issuer === new URL(issuer).href
    && typeof value.subject === "string" && value.subject.length > 0
    && Array.isArray(value.scopes) && value.scopes.every((scope) => typeof scope === "string" && scope.length > 0)
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() / 1_000;
}

function isProtectedResourceMetadataRequest(requestUrl: string | undefined, path: string): boolean {
  const requestPath = (requestUrl ?? "").split("?", 1)[0];
  // The adapter contract publishes the origin-level URL. The SDK's path-aware
  // form is also served so current RFC 9728 clients can discover the same document.
  return requestPath === "/.well-known/oauth-protected-resource"
    || requestPath === `/.well-known/oauth-protected-resource${path === "/" ? "" : path}`;
}

function protectedResourceMetadataResponse(request: IncomingMessage, authentication: NonNullable<RecipesMcpHttpOptions["authentication"]>): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const result = Response.json({
    resource: authentication.resource,
    authorization_servers: [authentication.issuer],
    scopes_supported: ["recipes:read", "recipes:write"],
  });
  return request.method === "HEAD" ? new Response(null, { status: result.status, headers: result.headers }) : result;
}

function toWebRequest(request: IncomingMessage, signal: AbortSignal, bodyLimit: number): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(request.pipe(new BodyLimitTransform(bodyLimit))) as ReadableStream;
  return new Request(`http://${request.headers.host ?? "localhost"}${request.url ?? "/"}`, {
    method, headers, body, signal,
    ...(body === undefined ? {} : { duplex: "half" }),
  } as RequestInit & { duplex?: "half" });
}

async function writeResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  if (webResponse.body === null) return void response.end();
  await new Promise<void>((resolve, reject) => Readable.fromWeb(webResponse.body! as never).once("error", reject).once("end", resolve).pipe(response));
}

function contentLengthExceeds(request: IncomingMessage, limit: number): boolean {
  const value = request.headers["content-length"];
  const length = typeof value === "string" ? Number(value) : undefined;
  return length !== undefined && Number.isFinite(length) && length > limit;
}

class BodyLimitTransform extends Transform {
  #length = 0;
  constructor(private readonly limit: number) { super(); }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    this.#length += chunk.length;
    callback(this.#length > this.limit ? new Error("Request body too large.") : undefined, chunk);
  }
}

function safeErrorMessage(error: unknown): string { return error instanceof Error ? error.message : "Unknown error"; }
