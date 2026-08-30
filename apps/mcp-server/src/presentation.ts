import { recipeUri } from "@edgestream/recipes-application";
import type { RecipeRecord, RecipeSummary } from "@edgestream/recipes-core";

export function recipeMetadata(summary: RecipeSummary) {
  return { id: summary.ref.id, name: summary.name, description: summary.description };
}

export function recipeResult(summary: RecipeSummary) {
  return { uri: recipeUri(summary.ref), ...recipeMetadata(summary) };
}

export function summaryFromRecord(record: RecipeRecord): RecipeSummary {
  return {
    ref: record.ref,
    name: record.document.name,
    description: record.document.description,
  };
}
