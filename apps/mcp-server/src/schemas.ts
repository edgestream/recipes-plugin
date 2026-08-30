import { isRecipeId } from "@edgestream/recipes-core";
import { z } from "zod";

export const recipeIdSchema = z.string().refine(isRecipeId, "Recipe ids must be non-empty file names without path separators.");
export const cursorSchema = z.string().min(1).optional();
export const limitSchema = z.number().int().min(1).max(100).default(20);
