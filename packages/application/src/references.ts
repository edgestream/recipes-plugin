import {
  assertRecipeId,
  assertProviderId,
  isRecipeId,
  type CollectionRef,
  type RecipeRef,
  type SourceRef,
} from "@edgestream/recipes-core";

export function recipeUri(ref: RecipeRef): string {
  assertProviderId(ref.provider);
  assertRecipeId(ref.id);
  return `recipes://${ref.provider}/${encodeURIComponent(ref.id)}`;
}

export function parseRecipeUri(value: string, expectedProvider?: string): RecipeRef {
  const uri = new URL(value);
  if (uri.protocol !== "recipes:") throw new TypeError("Recipe references must use the recipes: URI scheme.");
  assertProviderId(uri.hostname);
  if (expectedProvider !== undefined && uri.hostname !== expectedProvider) {
    throw new TypeError(`Recipe references must use provider ${expectedProvider}.`);
  }
  const parts = uri.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) throw new TypeError("Recipe references must identify exactly one recipe.");
  const id = decodeURIComponent(parts[0]!);
  assertRecipeId(id);
  return { provider: uri.hostname, id };
}

export function collectionUri(ref: CollectionRef): string {
  assertProviderId(ref.provider);
  return `catalog://${ref.provider}/${ref.path.map(collectionSegment).join("/")}`;
}

export function sourceRef(value: string): SourceRef {
  if (value.trim().length === 0) throw new TypeError("Recipe source references must not be empty.");
  return { value };
}

function collectionSegment(value: string): string {
  if (!isRecipeId(value)) throw new TypeError("Collection path segments must be non-empty names without path separators.");
  return encodeURIComponent(value);
}
