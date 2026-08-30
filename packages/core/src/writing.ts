import type { RequestContext } from "./catalog.js";
import type { RecipeDocument, RecipeProvenance, RecipeRecord } from "./model.js";

export interface CreateRecipeOptions {
  readonly id?: string;
  readonly provenance?: RecipeProvenance;
}

/** Writes owned recipe documents without exposing mutation to read-only catalogs. */
export interface RecipeWriter {
  create(recipe: RecipeDocument, options?: CreateRecipeOptions, context?: RequestContext): Promise<RecipeRecord>;
}
