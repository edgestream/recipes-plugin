import type { RequestContext } from "./catalog.js";
import type { RecipeDocument, RecipeProvenance, RecipeRecord, RecipeRef } from "./model.js";

export interface CreateRecipeOptions {
  readonly id?: string;
  readonly provenance?: RecipeProvenance;
}

/** Writes owned recipe documents without exposing mutation to read-only catalogs. */
export interface RecipeWriter {
  create(recipe: RecipeDocument, options?: CreateRecipeOptions, context?: RequestContext): Promise<RecipeRecord>;
}

/** Removes owned recipe records without exposing mutation to read-only catalogs. */
export interface RecipeDeleter {
  delete(ref: RecipeRef, context?: RequestContext): Promise<void>;
}
