export class RecipeNotFoundError extends Error {
  override readonly name = "RecipeNotFoundError";
}

export class RecipeConflictError extends Error {
  override readonly name = "RecipeConflictError";
}

export class UnsupportedRecipeCapabilityError extends Error {
  override readonly name = "UnsupportedRecipeCapabilityError";
}
