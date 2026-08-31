import { RecipesService } from "@edgestream/recipes-application";
import { ChefkochCatalog } from "@edgestream/recipes-provider-chefkoch";
import type { RecipeResolver } from "@edgestream/recipes-core";
import { UrlSource, type UrlSourceOptions } from "@edgestream/recipes-source-url";
import { FileStore } from "@edgestream/recipes-store-file";
import { CombinedCatalog, type RecipeProvider } from "./CombinedCatalog.js";
import { localRecipesConfiguration, type LocalRecipesConfiguration } from "./configuration.js";

export interface LocalRecipesOptions extends Partial<LocalRecipesConfiguration> {
  readonly source?: UrlSourceOptions;
}

/** Runtime presentation metadata derived from the explicit provider registry. */
export interface LocalRecipeProvider extends RecipeProvider {
  readonly title: string;
  readonly enumerateResources: boolean;
}

export interface LocalRecipesRuntime {
  readonly recipes: RecipesService;
  /** The configured default provider for provider-local CLI and MCP inputs. */
  readonly provider: string;
  readonly providers: readonly LocalRecipeProvider[];
}

/** Creates the shared local runtime used by both executable frontends. */
export function createLocalRecipes(options: LocalRecipesOptions = {}): LocalRecipesRuntime {
  const defaults = localRecipesConfiguration();
  const provider = options.provider ?? defaults.provider;
  const store = new FileStore(options.dataDirectory ?? defaults.dataDirectory, "personal");
  const source = new UrlSource(options.source);
  const additionalProviders = "providers" in options ? options.providers : defaults.providers;
  const providers = selectProviders(
    provider,
    additionalProviders,
    providerRegistry(store, source),
  );
  const catalog = new CombinedCatalog(store, providers);
  return {
    provider,
    providers,
    recipes: new RecipesService({
      catalog,
      search: catalog,
      writer: store,
      resolver: source,
    }),
  };
}

function providerRegistry(store: FileStore, resolver: RecipeResolver): ReadonlyMap<string, () => LocalRecipeProvider> {
  return new Map<string, () => LocalRecipeProvider>([
    ["personal", () => ({
      id: "personal",
      title: "Personal recipes",
      enumerateResources: true,
      catalog: store,
      search: store,
    })],
    ["chefkoch", () => {
      const catalog = new ChefkochCatalog({ resolver });
      return {
        id: "chefkoch",
        title: "Chefkoch recipes",
        enumerateResources: false,
        catalog,
        search: catalog,
      };
    }],
  ]);
}

function selectProviders(
  defaultProvider: string,
  additionalProviders: readonly string[] | undefined,
  registry: ReadonlyMap<string, () => LocalRecipeProvider>,
): LocalRecipeProvider[] {
  const selectedProviders = additionalProviders ?? [...registry.keys()];
  const ids = uniqueProviderIds([defaultProvider, ...selectedProviders, "personal"]);
  return ids.map((id) => {
    const factory = registry.get(id);
    if (!factory) throw new TypeError(`Recipe provider "${id}" is not registered.`);
    return factory();
  });
}

function uniqueProviderIds(ids: readonly string[]): string[] {
  const unique: string[] = [];
  for (const id of ids) {
    if (!unique.includes(id)) unique.push(id);
  }
  return unique;
}
