import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse, type McpServerFactory } from "@modelcontextprotocol/server";

const defaultBodyLimit = 1_048_576;

export interface RecipesMcpHttpOptions {
  readonly host: string;
  readonly port: number;
  readonly path?: string;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly bodyLimit?: number;
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
      await writeResponse(response, rejected ?? await handler.fetch(webRequest));
    } catch (error) {
      console.error(`Recipes MCP HTTP request failed: ${safeErrorMessage(error)}`);
      if (!response.headersSent) writeResponse(response, new Response("Internal server error.", { status: 500 }));
      else response.destroy();
    }
  });
  server.once("close", () => void handler.close().catch(() => undefined));
  return server;
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
