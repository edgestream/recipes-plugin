# Recipes Plugin

Keep a personal recipe collection and explore configured recipe sources through
the command line or an MCP client.

## Start here

Choose one entry point:

- **ChatGPT:** connect the hosted Recipes development app with OAuth. Follow the
  verified [ChatGPT guide](docs/CHATGPT.md). It is not a Directory listing.
- **Local command line:** build this checkout, then use `npx recipes` as shown
  below. Recipes are stored in the local data directory.
- **MCP, packaging, or deployment:** use [MCP.md](docs/MCP.md) for the server
  contract and [PLUGIN.md](docs/PLUGIN.md) for package contracts. These are
  technical references, not installation guides.

## What Recipes can do

The MCP server can:

- list your saved recipes, including the next page;
- search configured recipe providers without importing results;
- retrieve a complete recipe;
- import a selected provider recipe into your personal collection; and
- permanently delete a saved recipe.

Use prompts such as:

- “Show my saved recipes.”
- “Search recipes for tomato pasta.”
- “Show the details for that recipe.”
- “Import that provider recipe into my collection.”
- “Delete my saved recipe named …” (permanent).

Hosted production imports use provider references by default; direct URL imports
are not a normal production feature. MCP identifiers such as
`recipes://personal` and `recipes://{provider}/{id}` are not browser URLs.

## Local command line

Build the checkout once:

```bash
npm install
npm run build
```

Import, list, search, show, and delete a recipe:

```bash
npx recipes import https://raw.githubusercontent.com/edgestream/recipes-plugin/main/examples/spaghetti-carbonara.json
npx recipes list
npx recipes search Spaghetti
npx recipes show spaghetti-carbonara
npx recipes delete spaghetti-carbonara
```

Set `RECIPES_DATA_DIRECTORY` to keep the local collection outside the current
directory. See [CLI.md](docs/CLI.md) for commands, configuration, and URI rules.

## Development

```bash
npm run check
npm test
```

Provider contribution guidance is in [PROVIDER.md](docs/PROVIDER.md).
