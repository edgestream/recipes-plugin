export type CliCommand =
  | { readonly type: "import"; readonly source: string; readonly id?: string }
  | { readonly type: "delete"; readonly reference: string }
  | { readonly type: "list" }
  | { readonly type: "search"; readonly query: string }
  | { readonly type: "show"; readonly reference: string }
  | { readonly type: "help"; readonly invalid: boolean };

export function parseArguments(args: readonly string[]): CliCommand {
  const [command, ...rest] = args;
  switch (command) {
    case "import": return importCommand(rest);
    case "delete":
      if (rest.length !== 1) throw new Error("delete requires one recipe id or recipes: URI.");
      return { type: "delete", reference: rest[0]! };
    case "list":
      if (rest.length > 0) throw new Error("list does not accept arguments.");
      return { type: "list" };
    case "search": {
      const query = rest.join(" ").trim();
      if (!query) throw new Error("search requires a query.");
      return { type: "search", query };
    }
    case "show":
      if (rest.length !== 1) throw new Error("show requires one recipe id or recipes: URI.");
      return { type: "show", reference: rest[0]! };
    default:
      return { type: "help", invalid: command !== undefined };
  }
}

function importCommand(args: readonly string[]): CliCommand {
  const [source, ...options] = args;
  if (!source) throw new Error("import requires a JSON file path or URL.");
  if (options.length === 0) return { type: "import", source };
  if (options.length !== 2 || options[0] !== "--id" || !options[1]) {
    throw new Error("import accepts only --id <id> after the source.");
  }
  return { type: "import", source, id: options[1] };
}
