import type { RequestContext } from "./catalog.js";
import type { RecipeDocument, RecipeProvenance, SourceRef } from "./model.js";

export interface ResolvedRecipe {
  readonly document: RecipeDocument;
  readonly provenance: RecipeProvenance;
}

/** Resolves one import reference without knowing where recipes are stored. */
export interface RecipeResolver {
  resolve(source: SourceRef, context?: RequestContext): Promise<ResolvedRecipe | undefined>;
}
