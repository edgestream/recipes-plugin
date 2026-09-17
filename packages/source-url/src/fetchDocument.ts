import type { RequestContext, SourceRef } from "@edgestream/recipes-core";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) assertSize(declaredLength, options.maxBytes);
  const buffer = await response.arrayBuffer();
  assertSize(buffer.byteLength, options.maxBytes);
  return {
    mediaType: mediaType(response.headers.get("content-type")),
    text: new TextDecoder().decode(buffer),
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
  throw new TypeError("Recipe sources must use file:, http:, or https: URLs.");
}

async function fetchPublic(reference: URL, options: FetchDocumentOptions, context?: RequestContext): Promise<Response> {
  let current = reference;
  const redirects = options.maxRedirects ?? 3;
  for (let count = 0; ; count += 1) {
    if (options.hostedPublic) await assertHostedUrl(current, options.allowedHosts ?? []);
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

async function assertHostedUrl(url: URL, allowedHosts: readonly string[]): Promise<void> {
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !allowedHosts.includes(url.hostname)) {
    throw new TypeError("Hosted recipe imports require an allowed public HTTP(S) URL.");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) throw new TypeError("Recipe source address is not public.");
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b = -1] = address.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a !== 169 && a !== 192 && a !== 224 && a !== 240 && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
  }
  const value = address.toLowerCase();
  return value !== "::1" && !value.startsWith("fe80:") && !value.startsWith("fc") && !value.startsWith("fd") && !value.startsWith("ff") && !value.startsWith("::ffff:");
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

function assertSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) throw new Error(`Recipe source exceeds the ${maxBytes} byte limit.`);
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
