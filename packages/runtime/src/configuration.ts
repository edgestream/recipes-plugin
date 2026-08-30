export interface LocalRecipesConfiguration {
  readonly dataDirectory: string;
  readonly provider: string;
}

export function localRecipesConfiguration(env: NodeJS.ProcessEnv = process.env): LocalRecipesConfiguration {
  return {
    dataDirectory: env.RECIPES_DATA_DIRECTORY ?? "./data",
    provider: env.RECIPES_PROVIDER ?? "personal",
  };
}
