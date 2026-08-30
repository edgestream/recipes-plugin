import {
  RecipeConflictError,
  assertRecipeDocument,
  assertRecipeId,
  assertProviderId,
  cloneJson,
  isRecipeId,
  normalizeRecipeDocument,
  type CreateRecipeOptions,
  type ListRecipesRequest,
  type Page,
  type RecipeCatalog,
  type RecipeDocument,
  type RecipeRecord,
  type RecipeRef,
  type RecipeSearch,
  type RecipeSummary,
  type RecipeWriter,
  type RequestContext,
  type SearchRecipesRequest,
} from "@edgestream/recipes-core";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const defaultPageSize = 100;

/** A read/write recipe catalog backed by directly editable `<id>.json` files. */
export class FileStore implements RecipeCatalog, RecipeSearch, RecipeWriter {
  readonly #directory: string;
  readonly #provider: string;

  constructor(directory = "./data", provider = "personal") {
    assertProviderId(provider);
    this.#directory = directory;
    this.#provider = provider;
  }

  async create(recipe: RecipeDocument, options?: CreateRecipeOptions, context?: RequestContext): Promise<RecipeRecord> {
    context?.signal?.throwIfAborted();
    assertRecipeDocument(recipe);
    const id = options?.id ?? await this.#idFor(recipe, options);
    assertRecipeId(id);
    const document = normalizeRecipeDocument(recipe);
    await mkdir(this.#directory, { recursive: true });
    try {
      await writeFile(this.#pathFor(id), `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        signal: context?.signal,
      });
    } catch (error: unknown) {
      if (isExisting(error)) throw new RecipeConflictError(`A recipe with id ${id} already exists.`);
      throw error;
    }
    return record(this.#provider, id, document, options);
  }

  async get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== this.#provider) return undefined;
    assertRecipeId(ref.id);
    try {
      const document = await this.#read(ref.id, context);
      return record(this.#provider, ref.id, document);
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async list(request?: ListRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    const summaries: RecipeSummary[] = [];
    for (const id of await this.#ids()) {
      context?.signal?.throwIfAborted();
      summaries.push(summary(this.#provider, id, await this.#read(id, context)));
    }
    return page(summaries, request);
  }

  async search(request: SearchRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    const query = request.query.trim().toLocaleLowerCase();
    if (!query) return { items: [] };
    const matches: RecipeSummary[] = [];
    for (const id of await this.#ids()) {
      context?.signal?.throwIfAborted();
      const document = await this.#read(id, context);
      if (JSON.stringify(document).toLocaleLowerCase().includes(query)) {
        matches.push(summary(this.#provider, id, document));
      }
    }
    return page(matches, request);
  }

  async #idFor(recipe: RecipeDocument, options?: CreateRecipeOptions): Promise<string> {
    const source = typeof recipe["@id"] === "string"
      ? recipe["@id"]
      : typeof recipe.url === "string"
        ? recipe.url
        : options?.provenance?.source.value;
    if (!source) throw new Error("Recipes without a string @id, url, or provenance require an explicit id.");
    const stem = stemFromReference(source);
    if (!stem) throw new Error("Recipes with an unusable identity require an explicit id.");
    const usedIds = new Set(await this.#ids());
    let candidate = stem;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${stem}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  async #ids(): Promise<string[]> {
    try {
      const entries = await readdir(this.#directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && isRecipeFile(entry.name))
        .map((entry) => entry.name.slice(0, -".json".length))
        .filter(isRecipeId)
        .sort((left, right) => left.localeCompare(right));
    } catch (error: unknown) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  #pathFor(id: string): string {
    assertRecipeId(id);
    return join(this.#directory, `${id}.json`);
  }

  async #read(id: string, context?: RequestContext): Promise<RecipeDocument> {
    const value: unknown = JSON.parse(await readFile(this.#pathFor(id), {
      encoding: "utf8",
      signal: context?.signal,
    }));
    return normalizeRecipeDocument(value);
  }
}

function record(provider: string, id: string, document: RecipeDocument, options?: CreateRecipeOptions): RecipeRecord {
  const base = { ref: { provider, id }, document: cloneJson(document) };
  return options?.provenance === undefined ? base : { ...base, provenance: options.provenance };
}

function summary(provider: string, id: string, document: RecipeDocument): RecipeSummary {
  return { ref: { provider, id }, name: document.name, description: document.description };
}

function page<T>(values: readonly T[], request?: ListRecipesRequest): Page<T> {
  const offset = cursorOffset(request?.cursor);
  const limit = pageLimit(request?.limit);
  const items = values.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return nextOffset < values.length ? { items, nextCursor: String(nextOffset) } : { items };
}

function cursorOffset(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/u.test(cursor)) throw new TypeError("File store cursors must be non-negative offsets.");
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) throw new TypeError("File store cursor is too large.");
  return offset;
}

function pageLimit(limit?: number): number {
  if (limit === undefined) return defaultPageSize;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new TypeError("Recipe page limits must be integers between 1 and 1000.");
  }
  return limit;
}

function isRecipeFile(name: string): boolean {
  return name.endsWith(".json") && !name.endsWith(".personal.json");
}

function stemFromReference(value: string): string | undefined {
  let fileName: string;
  try {
    const url = new URL(value);
    fileName = url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname;
  } catch {
    fileName = value.split(/[\\/]/u).filter(Boolean).at(-1) ?? value;
  }
  const decoded = safeDecode(fileName).replace(/\.[a-z0-9]+$/iu, "");
  const stem = decoded
    .normalize("NFKD")
    .replace(/[^\w\s-]/gu, "")
    .trim()
    .replace(/[\s_]+/gu, "-")
    .toLocaleLowerCase();
  return stem || undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isExisting(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
