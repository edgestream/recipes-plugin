import {
  RecipeNotFoundError,
  UnsupportedRecipeCapabilityError,
  type CollectionSummary,
  type ListCollectionsRequest,
  type ListRecipesRequest,
  type Page,
  type RecipeCatalog,
  type RecipeCollections,
  type RecipeDeleter,
  type RecipeRecord,
  type RecipeRef,
  type RecipeResolver,
  type RecipeSearch,
  type RecipeSummary,
  type RecipeWriter,
  type RequestContext,
  type SearchRecipesRequest,
  type SourceRef,
} from "@edgestream/recipes-core";

export interface RecipesServiceOptions {
  readonly catalog: RecipeCatalog;
  readonly search?: RecipeSearch;
  readonly collections?: RecipeCollections;
  readonly writer?: RecipeWriter;
  readonly deleter?: RecipeDeleter;
  readonly resolver?: RecipeResolver;
}

export type ImportRecipeRequest =
  | { readonly source: SourceRef; readonly id?: string }
  | { readonly reference: RecipeRef; readonly id?: string };

export interface RecipesCapabilities {
  readonly search: boolean;
  readonly collections: boolean;
  readonly import: boolean;
  readonly delete: boolean;
}

/** Transport-neutral recipe use cases shared by CLI, MCP, and future frontends. */
export class RecipesService {
  readonly capabilities: RecipesCapabilities;
  readonly #catalog: RecipeCatalog;
  readonly #search: RecipeSearch | undefined;
  readonly #collections: RecipeCollections | undefined;
  readonly #writer: RecipeWriter | undefined;
  readonly #deleter: RecipeDeleter | undefined;
  readonly #resolver: RecipeResolver | undefined;

  constructor(options: RecipesServiceOptions) {
    this.#catalog = options.catalog;
    this.#search = options.search;
    this.#collections = options.collections;
    this.#writer = options.writer;
    this.#deleter = options.deleter;
    this.#resolver = options.resolver;
    this.capabilities = Object.freeze({
      search: options.search !== undefined,
      collections: options.collections !== undefined,
      import: options.writer !== undefined,
      delete: options.deleter !== undefined,
    });
  }

  getRecipe(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined> {
    return this.#catalog.get(ref, context);
  }

  listRecipes(request?: ListRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    return this.#catalog.list(request, context);
  }

  searchRecipes(request: SearchRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>> {
    if (!this.#search) throw new UnsupportedRecipeCapabilityError("Recipe search is not available.");
    return this.#search.search(request, context);
  }

  listCollections(request?: ListCollectionsRequest, context?: RequestContext): Promise<Page<CollectionSummary>> {
    if (!this.#collections) throw new UnsupportedRecipeCapabilityError("Recipe collection navigation is not available.");
    return this.#collections.listCollections(request, context);
  }

  async importRecipe(request: ImportRecipeRequest, context?: RequestContext): Promise<RecipeRecord> {
    if (!this.#writer) throw new UnsupportedRecipeCapabilityError("Recipe import is not available.");
    if ("reference" in request) {
      const recipe = await this.#catalog.get(request.reference, context);
      if (!recipe) throw new RecipeNotFoundError(`Recipe ${request.reference.provider}/${request.reference.id} was not found.`);
      const options = recipe.provenance === undefined
        ? request.id === undefined ? undefined : { id: request.id }
        : request.id === undefined ? { provenance: recipe.provenance } : { id: request.id, provenance: recipe.provenance };
      return this.#writer.create(recipe.document, options, context);
    }
    if (!this.#resolver) throw new UnsupportedRecipeCapabilityError("Recipe import from a source is not available.");
    const resolved = await this.#resolver.resolve(request.source, context);
    if (!resolved) throw new RecipeNotFoundError(`Recipe ${request.source.value} was not found.`);
    const options = request.id === undefined
      ? { provenance: resolved.provenance }
      : { id: request.id, provenance: resolved.provenance };
    return this.#writer.create(resolved.document, options, context);
  }

  async deleteRecipe(ref: RecipeRef, context?: RequestContext): Promise<void> {
    if (!this.#deleter) throw new UnsupportedRecipeCapabilityError("Recipe deletion is not available.");
    await this.#deleter.delete(ref, context);
  }
}
