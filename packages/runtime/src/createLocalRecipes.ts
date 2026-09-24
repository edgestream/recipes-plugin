import { RecipesService } from "@edgestream/recipes-application";
import { ChefkochCatalog } from "@edgestream/recipes-provider-chefkoch";
import type { RecipeResolver } from "@edgestream/recipes-core";
import { HostedFetchPolicy, UrlSource, type UrlSourceOptions } from "@edgestream/recipes-source-url";
import { FileStore, type FileStoreOptions } from "@edgestream/recipes-store-file";
import { CombinedCatalog, type RecipeProvider } from "./CombinedCatalog.js";
import { localRecipesConfiguration, type LocalRecipesConfiguration } from "./configuration.js";
import { personalStorageNamespace } from "./hosted.js";
import { join } from "node:path";

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

export interface HostedRecipesOptions extends Omit<LocalRecipesOptions, "dataDirectory"> {
  readonly dataRoot: string;
  /** These values must come from a successful private adapter verification. */
  readonly principal: { readonly issuer: string; readonly subject: string };
  /** Test-only escape hatch. Hosted production imports must use recipe references. */
  readonly allowDirectUrlImports?: boolean;
  /** Maximum bytes retained in one hosted personal collection. */
  readonly maxBytes?: number;
  readonly maxRequestsPerAccount?: number;
  readonly maxRequestsGlobal?: number;
  readonly maxConcurrentPerAccount?: number;
  readonly maxConcurrentGlobal?: number;
}

/** Creates the shared local runtime used by both executable frontends. */
export function createLocalRecipes(options: LocalRecipesOptions = {}): LocalRecipesRuntime {
  return createRecipes(options);
}

function createRecipes(options: LocalRecipesOptions, storeOptions: FileStoreOptions = {}, providerFetch?: typeof fetch, directResolver?: RecipeResolver): LocalRecipesRuntime {
  const defaults = localRecipesConfiguration();
  const provider = options.provider ?? defaults.provider;
  const store = new FileStore(options.dataDirectory ?? defaults.dataDirectory, "personal", storeOptions);
  const source = new UrlSource(options.source);
  const additionalProviders = "providers" in options ? options.providers : defaults.providers;
  const providers = selectProviders(
    provider,
    additionalProviders,
    providerRegistry(store, source, providerFetch),
  );
  const catalog = new CombinedCatalog(store, providers);
  return {
    provider,
    providers,
    recipes: new RecipesService({
      catalog,
      search: catalog,
      writer: store,
      deleter: store,
      resolver: directResolver ?? source,
    }),
  };
}

/** Creates an isolated personal runtime. This is intentionally not used by CLI or stdio. */
export function createHostedRecipes(options: HostedRecipesOptions): LocalRecipesRuntime {
  const namespace = personalStorageNamespace(options.principal.issuer, options.principal.subject);
  const hostedFetch = new HostedFetchPolicy({
    allowedHosts: hostedProviderHosts, account: namespace,
    ...(options.maxRequestsPerAccount === undefined ? {} : { maxRequestsPerAccount: options.maxRequestsPerAccount }),
    ...(options.maxRequestsGlobal === undefined ? {} : { maxRequestsGlobal: options.maxRequestsGlobal }),
    ...(options.maxConcurrentPerAccount === undefined ? {} : { maxConcurrentPerAccount: options.maxConcurrentPerAccount }),
    ...(options.maxConcurrentGlobal === undefined ? {} : { maxConcurrentGlobal: options.maxConcurrentGlobal }),
  });
  const providerSource = { ...options.source, fetch: hostedFetch.fetch, hostedPublic: true, allowedHosts: hostedProviderHosts };
  const directResolver = options.allowDirectUrlImports === true
    ? new UrlSource({ ...options.source, fetch: new HostedFetchPolicy({ allowedHosts: [], allowAnyPublicHost: true, account: `${namespace}:direct-test` }).fetch, hostedPublic: true, allowAnyPublicHost: true })
    : new DisabledHostedSourceResolver();
  return createRecipes({
    ...options,
    dataDirectory: join(options.dataRoot, namespace),
    source: providerSource,
  }, { idempotentSourceImports: true, maxBytes: options.maxBytes ?? 2 * 1024 * 1024 }, hostedFetch.fetch, directResolver);
}

const hostedProviderHosts = ["api.chefkoch.de", "www.chefkoch.de"];

class DisabledHostedSourceResolver implements RecipeResolver {
  async resolve(): Promise<never> { throw new TypeError("Hosted direct URL imports are disabled."); }
}

function providerRegistry(store: FileStore, resolver: RecipeResolver, providerFetch?: typeof fetch): ReadonlyMap<string, () => LocalRecipeProvider> {
  return new Map<string, () => LocalRecipeProvider>([
    ["personal", () => ({
      id: "personal",
      title: "Personal recipes",
      enumerateResources: true,
      catalog: store,
      search: store,
    })],
    ["chefkoch", () => {
      const catalog = new ChefkochCatalog({ resolver, ...(providerFetch === undefined ? {} : { fetch: providerFetch }) });
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
