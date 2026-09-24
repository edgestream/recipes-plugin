import {
  RecipeConflictError,
  RecipeNotFoundError,
  UnsupportedRecipeCapabilityError,
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
  type RecipeDeleter,
  type RecipeRecord,
  type RecipeRef,
  type RecipeSearch,
  type RecipeSummary,
  type RecipeWriter,
  type RequestContext,
  type SearchRecipesRequest,
} from "@edgestream/recipes-core";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const defaultPageSize = 100;
const directoryWrites = new Map<string, Promise<void>>();

export interface FileStoreOptions {
  /** Optional aggregate byte limit for one directly editable collection. */
  readonly maxBytes?: number;
  /**
   * Return an existing automatically named record when its persisted source
   * provenance has the same canonical URL. Intended for hosted collections.
   */
  readonly idempotentSourceImports?: boolean;
}

/** A read/write recipe catalog backed by directly editable `<id>.json` files. */
export class FileStore implements RecipeCatalog, RecipeSearch, RecipeWriter, RecipeDeleter {
  readonly #directory: string;
  readonly #provider: string;

  readonly #maxBytes: number | undefined;
  readonly #idempotentSourceImports: boolean;

  constructor(directory = "./data", provider = "personal", options: FileStoreOptions = {}) {
    assertProviderId(provider);
    if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1)) throw new TypeError("File store maxBytes must be a positive safe integer.");
    this.#directory = directory;
    this.#provider = provider;
    this.#maxBytes = options.maxBytes;
    this.#idempotentSourceImports = options.idempotentSourceImports ?? false;
  }

  async create(recipe: RecipeDocument, options?: CreateRecipeOptions, context?: RequestContext): Promise<RecipeRecord> {
    context?.signal?.throwIfAborted();
    assertRecipeDocument(recipe);
    const document = normalizeRecipeDocument(recipe);
    const encoded = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
    const provenanceEncoded = options?.provenance === undefined
      ? undefined
      : Buffer.from(`${JSON.stringify(options.provenance, null, 2)}\n`, "utf8");
    let created: RecipeRecord | undefined;
    await exclusiveDirectoryWrite(this.#directory, async () => {
      context?.signal?.throwIfAborted();
      if (this.#idempotentSourceImports && options?.id === undefined) {
        const existing = await this.#findBySource(options?.provenance?.source.value);
        if (existing !== undefined) {
          created = existing;
          return;
        }
      }
      const id = options?.id ?? await this.#idFor(recipe, options);
      assertRecipeId(id);
      await this.#ensureDirectory();
      if (this.#maxBytes !== undefined && await this.#usedBytes() + encoded.byteLength + (provenanceEncoded?.byteLength ?? 0) > this.#maxBytes) {
        throw new Error("Personal recipe collection quota exceeded.");
      }
      const target = this.#pathFor(id);
      const temporary = `${target}.${randomUUID()}.tmp`;
      let published = false;
      try {
        await writeFile(temporary, encoded, { flag: "wx", signal: context?.signal });
        context?.signal?.throwIfAborted();
        await link(temporary, target);
        published = true;
        await this.#writeProvenance(id, provenanceEncoded, context);
      } catch (error: unknown) {
        if (published) await unlink(target).catch(() => undefined);
        if (isExisting(error)) throw new RecipeConflictError(`A recipe with id ${id} already exists.`);
        throw error;
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
      created = record(this.#provider, id, document, options);
    });
    return created!;
  }

  async delete(ref: RecipeRef, context?: RequestContext): Promise<void> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== this.#provider) {
      throw new UnsupportedRecipeCapabilityError(`Recipe deletion is not available for provider ${ref.provider}.`);
    }
    assertRecipeId(ref.id);
    await exclusiveDirectoryWrite(this.#directory, async () => {
      try {
        await unlink(this.#pathFor(ref.id));
      } catch (error: unknown) {
        if (isMissing(error)) throw new RecipeNotFoundError(`Recipe ${ref.provider}/${ref.id} was not found.`);
        throw error;
      }
      await unlink(this.#provenancePathFor(ref.id)).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    });
  }

  async get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== this.#provider) return undefined;
    assertRecipeId(ref.id);
    try {
      const document = await this.#read(ref.id, context);
      return record(this.#provider, ref.id, document, provenanceOptions(await this.#readProvenance(ref.id)));
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
      await this.#ensureDirectory();
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

  async #usedBytes(): Promise<number> {
    let total = 0;
    for (const entry of await readdir(this.#directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const details = await lstat(join(this.#directory, entry.name));
      if (!details.isFile()) continue;
      total += details.size;
    }
    return total;
  }

  async #ensureDirectory(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const details = await lstat(this.#directory);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Recipe collection directory must not be a symbolic link.");
  }

  #pathFor(id: string): string {
    assertRecipeId(id);
    return join(this.#directory, `${id}.json`);
  }

  #provenancePathFor(id: string): string {
    assertRecipeId(id);
    return join(this.#directory, `${id}.personal.json`);
  }

  async #read(id: string, context?: RequestContext): Promise<RecipeDocument> {
    const value: unknown = JSON.parse(await this.#readFile(this.#pathFor(id), context));
    return normalizeRecipeDocument(value);
  }

  async #readFile(path: string, context?: RequestContext): Promise<string> {
    await this.#ensureDirectory();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { return await handle.readFile({ encoding: "utf8", signal: context?.signal }); }
    finally { await handle.close(); }
  }

  async #findBySource(source: string | undefined): Promise<RecipeRecord | undefined> {
    const canonical = canonicalSource(source);
    if (canonical === undefined) return undefined;
    for (const id of await this.#ids()) {
      const provenance = await this.#readProvenance(id);
      if (canonicalSource(provenance?.source.value) === canonical) {
        return record(this.#provider, id, await this.#read(id), provenanceOptions(provenance));
      }
    }
    return undefined;
  }

  async #readProvenance(id: string): Promise<CreateRecipeOptions["provenance"] | undefined> {
    try {
      const value: unknown = JSON.parse(await this.#readFile(this.#provenancePathFor(id)));
      if (!isProvenance(value)) return undefined;
      return value;
    } catch (error: unknown) {
      if (isMissing(error) || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  async #writeProvenance(id: string, encoded: Buffer | undefined, context?: RequestContext): Promise<void> {
    if (encoded === undefined) return;
    const target = this.#provenancePathFor(id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, encoded, { flag: "wx", signal: context?.signal });
      context?.signal?.throwIfAborted();
      await link(temporary, target);
    } catch (error: unknown) {
      if (isExisting(error)) throw new RecipeConflictError(`Recipe provenance for id ${id} already exists.`);
      throw error;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}

async function exclusiveDirectoryWrite(directory: string, operation: () => Promise<void>): Promise<void> {
  const previous = directoryWrites.get(directory) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => next);
  directoryWrites.set(directory, queued);
  await previous;
  try { await operation(); } finally {
    release();
    if (directoryWrites.get(directory) === queued) directoryWrites.delete(directory);
  }
}

function record(provider: string, id: string, document: RecipeDocument, options?: CreateRecipeOptions): RecipeRecord {
  const base = { ref: { provider, id }, document: cloneJson(document) };
  return options?.provenance === undefined ? base : { ...base, provenance: options.provenance };
}

function provenanceOptions(provenance: CreateRecipeOptions["provenance"]): CreateRecipeOptions | undefined {
  return provenance === undefined ? undefined : { provenance };
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

function isProvenance(value: unknown): value is NonNullable<CreateRecipeOptions["provenance"]> {
  return typeof value === "object" && value !== null
    && "source" in value
    && typeof value.source === "object" && value.source !== null
    && "value" in value.source && typeof value.source.value === "string";
}

function canonicalSource(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try { return new URL(value).href; } catch { return value; }
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
