import { recipeUri } from "@edgestream/recipes-application";
import type { RecipeRecord, RecipeSummary } from "@edgestream/recipes-core";

export function recipeMetadata(summary: RecipeSummary) {
  const metadata = {
    provider: summary.ref.provider,
    id: summary.ref.id,
    name: summary.name,
    description: summary.description,
  };
  return summary.importSource === undefined ? metadata : { ...metadata, importSource: summary.importSource.value };
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
