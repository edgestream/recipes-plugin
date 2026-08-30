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
}

export async function fetchDocument(
  source: SourceRef,
  options: FetchDocumentOptions,
  context?: RequestContext,
): Promise<SourceDocument | undefined> {
  const reference = sourceUrl(source.value);
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

  const response = await (options.fetch ?? fetch)(reference, {
    headers: { accept: "application/ld+json, application/json, text/html;q=0.9" },
    signal: requestSignal(context?.signal, options.timeoutMs),
  });
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

function sourceUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    return pathToFileURL(value);
  }
  throw new TypeError("Recipe sources must use file:, http:, or https: URLs.");
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
