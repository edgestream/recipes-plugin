import type { RecipeRecord, RecipeRef, RecipeSummary } from "./model.js";

/** Optional request context shared by local and remote adapters. */
export interface RequestContext {
  readonly signal?: AbortSignal;
}

/** A provider-native page. Cursors are opaque outside the provider. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export type ListRecipesRequest = PageRequest;

export interface SearchRecipesRequest extends PageRequest {
  readonly query: string;
}

/** A read-only catalog that guarantees every listed reference can be read back. */
export interface RecipeCatalog {
  get(ref: RecipeRef, context?: RequestContext): Promise<RecipeRecord | undefined>;
  list(request?: ListRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>>;
}

/** Optional full-text search capability for a recipe catalog. */
export interface RecipeSearch {
  search(request: SearchRecipesRequest, context?: RequestContext): Promise<Page<RecipeSummary>>;
}

export interface CollectionRef {
  readonly provider: string;
  readonly path: readonly string[];
}

export interface CollectionSummary {
  readonly ref: CollectionRef;
  readonly name: string;
  readonly description: string;
}

export interface ListCollectionsRequest extends PageRequest {
  readonly parent?: CollectionRef;
}

/** Optional hierarchical collection navigation capability. */
export interface RecipeCollections {
  listCollections(request?: ListCollectionsRequest, context?: RequestContext): Promise<Page<CollectionSummary>>;
}
