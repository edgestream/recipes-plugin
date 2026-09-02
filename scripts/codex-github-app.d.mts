export type ParsedArguments = {
  command: string | undefined;
  child: string[];
  repo: string | undefined;
};

export function createAppJwt(appId: string, privateKey: string, now?: number): string;
export function parseArguments(argv: string[]): ParsedArguments;
