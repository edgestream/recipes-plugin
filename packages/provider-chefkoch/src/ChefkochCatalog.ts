import {
  assertRecipeId,
  type ListRecipesRequest,
  type Page,
  type RecipeCatalog,
  type RecipeRecord,
  type RecipeRef,
  type RecipeResolver,
  type RecipeSearch,
  type RecipeSummary,
  type RequestContext,
  type SearchRecipesRequest,
} from "@edgestream/recipes-core";

const providerId = "chefkoch";
const defaultPageSize = 20;
const maximumPageSize = 100;
const defaultTimeoutMs = 15_000;
const defaultMaximumBytes = 2 * 1024 * 1024;
const cursorPrefix = "chefkoch:";

export interface ChefkochCatalogOptions {
  /** The generic document resolver is injected so this package depends only on core contracts. */
  readonly resolver: RecipeResolver;
  readonly fetch?: typeof fetch;
  readonly apiBaseUrl?: string;
  readonly siteBaseUrl?: string;
  readonly timeoutMs?: number;
  readonly maximumBytes?: number;
}

/** A read-only catalog backed by Chefkoch search results and public recipe pages. */
export class ChefkochCatalog implements RecipeCatalog, RecipeSearch {
  readonly #resolver: RecipeResolver;
  readonly #fetch: typeof fetch;
  readonly #apiBaseUrl: URL;
  readonly #siteBaseUrl: URL;
  readonly #timeoutMs: number;
  readonly #maximumBytes: number;

  constructor(options: ChefkochCatalogOptions) {
    this.#resolver = options.resolver;
    this.#fetch = options.fetch ?? fetch;
    this.#apiBaseUrl = apiBaseUrl(options.apiBaseUrl ?? "https://api.chefkoch.de/v2/");
    this.#siteBaseUrl = siteBaseUrl(options.siteBaseUrl ?? "https://www.chefkoch.de/");
    this.#timeoutMs = positiveInteger(options.timeoutMs ?? defaultTimeoutMs, "Chefkoch timeouts");
    this.#maximumBytes = positiveInteger(options.maximumBytes ?? defaultMaximumBytes, "Chefkoch response limits");
  }

  async get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== providerId) return undefined;
    assertRecipeId(ref.id);
    assertChefkochRecipeId(ref.id);
    const resolved = await this.#resolver.resolve({ value: this.#recipeUrl(ref.id) }, context);
    return resolved === undefined ? undefined : { ref, ...resolved };
  }

  /** Chefkoch has no stable browsable catalog; discover recipes through search instead. */
  async list(_request?: ListRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    context?.signal?.throwIfAborted();
    return { items: [] };
  }

  async search(request: SearchRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    const query = request.query.trim();
    if (!query) throw new TypeError("Chefkoch search queries must not be empty.");
    const limit = pageLimit(request.limit);
    const offset = cursorOffset(request.cursor);
    const url = new URL("search-gateway/recipes", this.#apiBaseUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const response = await this.#fetchSearch(url, context);
    const results = arrayAt(response, "results", "Chefkoch search results").map((item, index) => summaryFromResult(item, index));
    const count = nonNegativeIntegerAt(response, "count", "Chefkoch search result count");
    const nextOffset = offset + results.length;
    return nextOffset < count && results.length > 0
      ? { items: results, nextCursor: `${cursorPrefix}${nextOffset}` }
      : { items: results };
  }

  async #fetchSearch(url: URL, context?: RequestContext): Promise<Record<string, unknown>> {
    const response = await this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: requestSignal(context?.signal, this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`Chefkoch search gateway returned HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength)) assertSize(declaredLength, this.#maximumBytes);
    const body = await response.arrayBuffer();
    assertSize(body.byteLength, this.#maximumBytes);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new Error("Chefkoch search gateway returned invalid JSON.");
    }
    const object = asObject(value);
    if (!object) throw new Error("Chefkoch search gateway returned an invalid response object.");
    return object;
  }

  #recipeUrl(id: string): string {
    return new URL(`rezepte/${id}/`, this.#siteBaseUrl).href;
  }
}

function apiBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new TypeError("Chefkoch API URLs must use HTTPS.");
  return new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
}

function siteBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.chefkoch.de" || url.port || url.username || url.password) {
    throw new TypeError("Chefkoch recipe pages must use https://www.chefkoch.de/.");
  }
  return new URL("/", url);
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

function summaryFromResult(value: unknown, index: number): RecipeSummary {
  const outer = asObject(value);
  if (!outer) throw new Error(`Chefkoch search result ${index} is not an object.`);
  const recipe = asObject(outer.recipe) ?? outer;
  const id = decimalRecipeId(recipe.id, `Chefkoch search result ${index} id`);
  const sourceUrl = optionalString(recipe.siteUrl) ?? stringAt(recipe, "url", `Chefkoch search result ${index} URL`);
  const siteUrl = trustedRecipeUrl(sourceUrl, id);
  const name = optionalString(recipe.title) ?? optionalString(recipe.name) ?? "Untitled recipe";
  return {
    ref: { provider: providerId, id },
    name,
    description: "",
    importSource: { value: siteUrl },
  };
}

function trustedRecipeUrl(value: string, id: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Chefkoch search results must contain a valid recipe URL.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:"
    || url.hostname !== "www.chefkoch.de"
    || url.port
    || url.username
    || url.password
    || segments[0] !== "rezepte"
    || segments[1] !== id
  ) {
    throw new Error("Chefkoch search results must contain canonical Chefkoch recipe URLs.");
  }
  return url.href;
}

function cursorOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const matched = new RegExp(`^${cursorPrefix}(0|[1-9]\\d*)$`, "u").exec(cursor);
  if (!matched) throw new TypeError("Chefkoch cursors are not valid.");
  const offset = Number(matched[1]);
  if (!Number.isSafeInteger(offset)) throw new TypeError("Chefkoch cursors are too large.");
  return offset;
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return defaultPageSize;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumPageSize) {
    throw new TypeError(`Chefkoch page limits must be integers between 1 and ${maximumPageSize}.`);
  }
  return value;
}

function assertChefkochRecipeId(value: string): void {
  if (!/^[1-9]\d*$/u.test(value)) throw new TypeError("Chefkoch recipe ids must be decimal numbers.");
}

function decimalRecipeId(value: unknown, name: string): string {
  const result = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^[1-9]\d*$/u.test(result)) throw new Error(`${name} must be a decimal recipe id.`);
  return result;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayAt(value: Record<string, unknown>, key: string, name: string): unknown[] {
  const result = value[key];
  if (!Array.isArray(result)) throw new Error(`${name} must be an array.`);
  return result;
}

function nonNegativeIntegerAt(value: Record<string, unknown>, key: string, name: string): number {
  const result = value[key];
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return result;
}

function stringAt(value: Record<string, unknown>, key: string, name: string): string {
  const result = optionalString(value[key]);
  if (!result) throw new Error(`${name} must be a non-empty string.`);
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer.`);
  return value;
}

function assertSize(value: number, maximumBytes: number): void {
  if (value > maximumBytes) throw new Error(`Chefkoch search responses exceed the ${maximumBytes} byte limit.`);
}
