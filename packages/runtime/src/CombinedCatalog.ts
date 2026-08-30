import type {
  ListRecipesRequest,
  Page,
  RecipeCatalog,
  RecipeRecord,
  RecipeRef,
  RecipeSearch,
  RecipeSummary,
  RequestContext,
  SearchRecipesRequest,
} from "@edgestream/recipes-core";

export interface RecipeProvider {
  readonly id: string;
  readonly catalog: RecipeCatalog;
  readonly search: RecipeSearch;
}

/** Routes reads by provider and searches every configured provider in parallel. */
export class CombinedCatalog implements RecipeCatalog, RecipeSearch {
  readonly #listCatalog: RecipeCatalog;
  readonly #providers: ReadonlyMap<string, RecipeProvider>;

  constructor(listCatalog: RecipeCatalog, providers: readonly RecipeProvider[]) {
    this.#listCatalog = listCatalog;
    this.#providers = new Map(providers.map((provider) => [provider.id, provider]));
    if (this.#providers.size !== providers.length) throw new TypeError("Recipe provider ids must be unique.");
  }

  get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    const provider = this.#providers.get(ref.provider);
    return provider === undefined ? Promise.resolve(undefined) : provider.catalog.get(ref, context);
  }

  list(request?: ListRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    return this.#listCatalog.list(request, context);
  }

  async search(request: SearchRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    context?.signal?.throwIfAborted();
    if (request.cursor !== undefined) throw new TypeError("Combined recipe search does not support cursors.");
    const providerRequest = request.limit === undefined
      ? { query: request.query }
      : { query: request.query, limit: request.limit };
    const pages = await Promise.all(
      [...this.#providers.values()].map((provider) => provider.search.search(providerRequest, context)),
    );
    return { items: pages.flatMap((page) => page.items) };
  }
}
