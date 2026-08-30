/** Identifies a recipe within one provider without prescribing a transport URI. */
export interface RecipeRef {
  readonly provider: string;
  readonly id: string;
}

/** Minimal recipe fields used for listing and search results. */
export interface RecipeSummary {
  readonly ref: RecipeRef;
  readonly name: string;
  readonly description: string;
}

/** A stored or remotely resolved recipe together with its application identity. */
export interface RecipeRecord {
  readonly ref: RecipeRef;
  readonly document: RecipeDocument;
  readonly provenance?: RecipeProvenance;
}

/** Records where an imported recipe came from without changing its schema.org data. */
export interface RecipeProvenance {
  readonly source: SourceRef;
}

/** A transport-neutral source reference interpreted by a RecipeResolver. */
export interface SourceRef {
  readonly value: string;
}

/** A normalized schema.org Recipe document. Its `url` remains source data. */
export type RecipeDocument = JsonObject & {
  readonly name: string;
  readonly description: string;
};

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

const providerPattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;

/** Ensures that a value is a normalized schema.org Recipe document. */
export function assertRecipeDocument(value: unknown): asserts value is RecipeDocument {
  if (!isJsonObject(value)) throw new TypeError("A recipe document must be a JSON object.");
  if (!hasRecipeType(value)) throw new TypeError("A recipe document must declare @type Recipe.");
  if (typeof value.name !== "string") throw new TypeError("A recipe document must have a string name.");
  if (typeof value.description !== "string") throw new TypeError("A recipe document must have a string description.");
}

/** Adds common display fields without replacing schema.org identity fields. */
export function normalizeRecipeDocument(value: unknown): RecipeDocument {
  if (!isJsonObject(value)) throw new TypeError("A recipe document must be a JSON object.");
  if (!hasRecipeType(value)) throw new TypeError("A recipe document must declare @type Recipe.");
  return {
    ...cloneJson(value),
    name: typeof value.name === "string" ? value.name : "Untitled recipe",
    description: typeof value.description === "string" ? value.description : "",
  };
}

/** Creates an isolated copy of JSON-compatible values and aggregate records. */
export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

/** Returns whether a value is a non-array JSON object. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns whether a recipe id is safe to use as one provider-local file name. */
export function isRecipeId(value: string): boolean {
  return value.trim().length > 0
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !value.includes("\\")
    && !value.includes("\0");
}

export function assertRecipeId(value: string): void {
  if (!isRecipeId(value)) throw new TypeError("Recipe ids must be non-empty file names without path separators.");
}

export function isProviderId(value: string): boolean {
  return providerPattern.test(value);
}

export function assertProviderId(value: string): void {
  if (!isProviderId(value)) throw new TypeError("Provider ids must use lowercase hostname characters.");
}

function hasRecipeType(value: JsonObject): boolean {
  const type = value["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}
