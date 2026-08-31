import { assertProviderId } from "@edgestream/recipes-core";

export interface LocalRecipesConfiguration {
  readonly dataDirectory: string;
  /** The provider used for provider-local CLI references and MCP defaults. */
  readonly provider: string;
  /** Additional provider ids selected by the environment; undefined enables every registered provider. */
  readonly providers: readonly string[] | undefined;
}

export function localRecipesConfiguration(env: NodeJS.ProcessEnv = process.env): LocalRecipesConfiguration {
  const provider = env.RECIPES_PROVIDER ?? "personal";
  assertProviderId(provider);
  return {
    dataDirectory: env.RECIPES_DATA_DIRECTORY ?? "./data",
    provider,
    providers: providerList(env.RECIPES_PROVIDERS),
  };
}

function providerList(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!value.trim()) return [];
  const providers = value.trim().split(/\s+/u);
  providers.forEach(assertProviderId);
  if (new Set(providers).size !== providers.length) {
    throw new TypeError("RECIPES_PROVIDERS must not contain duplicate provider ids.");
  }
  return providers;
}
