import {
  normalizeRecipeDocument,
  type RecipeResolver,
  type RequestContext,
  type ResolvedRecipe,
  type SourceRef,
} from "@edgestream/recipes-core";
import { fetchDocument } from "./fetchDocument.js";
import { parseRecipeDocument } from "./jsonLd.js";

export interface UrlSourceOptions {
  readonly fetch?: typeof fetch;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

/** Resolves Recipe JSON directly or from HTML JSON-LD metadata. */
export class UrlSource implements RecipeResolver {
  readonly #options: Required<Omit<UrlSourceOptions, "fetch">> & Pick<UrlSourceOptions, "fetch">;

  constructor(options: UrlSourceOptions = {}) {
    this.#options = {
      maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
      timeoutMs: options.timeoutMs ?? 15_000,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    };
  }

  async resolve(source: SourceRef, context?: RequestContext): Promise<ResolvedRecipe | undefined> {
    const fetched = await fetchDocument(source, this.#options, context);
    if (!fetched) return undefined;
    return {
      document: normalizeRecipeDocument(parseRecipeDocument(fetched.text, fetched.mediaType)),
      provenance: { source: fetched.source },
    };
  }
}
