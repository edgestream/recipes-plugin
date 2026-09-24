import type { RequestContext, SourceRef } from "@edgestream/recipes-core";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export interface SourceDocument {
  readonly mediaType: string;
  readonly text: string;
  readonly source: SourceRef;
}

export interface FetchDocumentOptions {
  readonly fetch?: typeof fetch;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly hostedPublic?: boolean;
  readonly allowedHosts?: readonly string[];
  readonly allowAnyPublicHost?: boolean;
  readonly maxRedirects?: number;
}

export async function fetchDocument(
  source: SourceRef,
  options: FetchDocumentOptions,
  context?: RequestContext,
): Promise<SourceDocument | undefined> {
  const reference = sourceUrl(source.value, options.hostedPublic === true);
  if (reference.protocol === "file:") {
    try {
      const buffer = await readFile(reference, { signal: context?.signal });
      assertSize(buffer.byteLength, options.maxBytes);
      return {
        mediaType: isHtmlPath(reference.pathname) ? "text/html" : "application/json",
        text: buffer.toString("utf8"),
        source: { value: reference.href },
      };
    } catch (error: unknown) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  const response = await fetchPublic(reference, options, context);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Could not read ${reference.href}: HTTP ${response.status}`);
  const text = await responseText(response, options.maxBytes);
  return {
    mediaType: mediaType(response.headers.get("content-type")),
    text,
    source: { value: response.url || reference.href },
  };
}

function sourceUrl(value: string, hostedPublic: boolean): URL {
  try {
    const url = new URL(value);
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") {
      if (hostedPublic && url.protocol === "file:") throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
      return url;
    }
  } catch {
    if (hostedPublic) throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
    return pathToFileURL(value);
  }
  if (hostedPublic) throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
  throw new TypeError("Recipe sources must use file:, http:, or https: URLs.");
}

async function fetchPublic(reference: URL, options: FetchDocumentOptions, context?: RequestContext): Promise<Response> {
  let current = reference;
  const redirects = options.maxRedirects ?? 3;
  for (let count = 0; ; count += 1) {
    if (options.hostedPublic) assertHostedUrl(current, options.allowedHosts ?? [], options.allowAnyPublicHost ?? false);
    const response = await (options.fetch ?? fetch)(current, {
      headers: { accept: "application/ld+json, application/json, text/html;q=0.9" },
      redirect: "manual",
      signal: requestSignal(context?.signal, options.timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || count >= redirects) throw new Error("Recipe source redirect was not allowed.");
    current = new URL(location, current);
  }
}

function assertHostedUrl(url: URL, allowedHosts: readonly string[], allowAnyPublicHost: boolean): void {
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || (url.port !== "" && url.port !== (url.protocol === "https:" ? "443" : "80")) || (!allowAnyPublicHost && !allowedHosts.includes(url.hostname))) {
    throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
  }
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

function assertSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) throw new Error(`Recipe source exceeds the ${maxBytes} byte limit.`);
}

/** Reads decoded response chunks while enforcing the limit before retaining them. */
export async function responseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) assertSize(declaredLength, maxBytes);
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      assertSize(total, maxBytes);
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

function isHtmlPath(path: string): boolean {
  return path.endsWith(".html") || path.endsWith(".htm");
}

function mediaType(contentType: string | null): string {
  return contentType?.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "application/json";
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
