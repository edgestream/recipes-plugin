import { RecipesService } from "@edgestream/recipes-application";
import { UrlSource, type UrlSourceOptions } from "@edgestream/recipes-source-url";
import { FileStore } from "@edgestream/recipes-store-file";
import { localRecipesConfiguration, type LocalRecipesConfiguration } from "./configuration.js";

export interface LocalRecipesOptions extends Partial<LocalRecipesConfiguration> {
  readonly source?: UrlSourceOptions;
}

export interface LocalRecipesRuntime {
  readonly recipes: RecipesService;
  readonly provider: string;
}

/** Creates the shared local runtime used by both executable frontends. */
export function createLocalRecipes(options: LocalRecipesOptions = {}): LocalRecipesRuntime {
  const defaults = localRecipesConfiguration();
  const provider = options.provider ?? defaults.provider;
  const store = new FileStore(options.dataDirectory ?? defaults.dataDirectory, provider);
  return {
    provider,
    recipes: new RecipesService({
      catalog: store,
      search: store,
      writer: store,
      deleter: store,
      resolver: new UrlSource(options.source),
    }),
  };
}
