import {
  RecipeConflictError,
  RecipeNotFoundError,
  UnsupportedRecipeCapabilityError,
  assertRecipeDocument,
  assertRecipeId,
  cloneJson,
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

/** Test adapter used by application and protocol tests. */
export class MemoryStore implements RecipeCatalog, RecipeSearch, RecipeWriter, RecipeDeleter {
  readonly #records = new Map<string, RecipeRecord>();

  constructor(readonly provider = "personal") {}

  async create(recipe: RecipeDocument, options?: CreateRecipeOptions): Promise<RecipeRecord> {
    assertRecipeDocument(recipe);
    const id = options?.id ?? idFromRecipe(recipe, options);
    assertRecipeId(id);
    if (this.#records.has(id)) throw new RecipeConflictError(`A recipe with id ${id} already exists.`);
    const record = recipeRecord(this.provider, id, normalizeRecipeDocument(recipe), options);
    this.#records.set(id, cloneRecord(record));
    return cloneRecord(record);
  }

  async delete(ref: RecipeRef, context?: RequestContext): Promise<void> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== this.provider) {
      throw new UnsupportedRecipeCapabilityError(`Recipe deletion is not available for provider ${ref.provider}.`);
    }
    if (!this.#records.delete(ref.id)) {
      throw new RecipeNotFoundError(`Recipe ${ref.provider}/${ref.id} was not found.`);
    }
  }

  async get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    context?.signal?.throwIfAborted();
    if (ref.provider !== this.provider) return undefined;
    const record = this.#records.get(ref.id);
    return record && cloneRecord(record);
  }

  async list(request?: ListRecipesRequest): Promise<Page<RecipeSummary>> {
    return page([...this.#records.values()].map(recipeSummary), request);
  }

  async search(request: SearchRecipesRequest): Promise<Page<RecipeSummary>> {
    const query = request.query.trim().toLocaleLowerCase();
    const matches = [...this.#records.values()]
      .filter((record) => JSON.stringify(record.document).toLocaleLowerCase().includes(query))
      .map(recipeSummary);
    return page(matches, request);
  }
}

function recipeRecord(provider: string, id: string, document: RecipeDocument, options?: CreateRecipeOptions): RecipeRecord {
  const record = { ref: { provider, id }, document: cloneJson(document) };
  return options?.provenance === undefined ? record : { ...record, provenance: options.provenance };
}

function cloneRecord(record: RecipeRecord): RecipeRecord {
  return cloneJson(record);
}

function recipeSummary(record: RecipeRecord): RecipeSummary {
  return {
    ref: record.ref,
    name: record.document.name,
    description: record.document.description,
  };
}

function page<T>(values: readonly T[], request?: ListRecipesRequest): Page<T> {
  const offset = request?.cursor === undefined ? 0 : Number(request.cursor);
  const limit = request?.limit ?? 100;
  const items = values.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return nextOffset < values.length ? { items, nextCursor: String(nextOffset) } : { items };
}

function idFromRecipe(recipe: RecipeDocument, options?: CreateRecipeOptions): string {
  const source = typeof recipe["@id"] === "string"
    ? recipe["@id"]
    : typeof recipe.url === "string"
      ? recipe.url
      : options?.provenance?.source.value;
  if (!source) throw new Error("An explicit recipe id is required.");
  const candidate = source.split(/[\\/]/u).filter(Boolean).at(-1)?.replace(/\.[a-z0-9]+(?:#.*)?$/iu, "");
  if (!candidate) throw new Error("An explicit recipe id is required.");
  return candidate.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
