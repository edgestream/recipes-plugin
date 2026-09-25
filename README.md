# Recipes Plugin

*Cooking recipes*

Search and retrieve cooking recipes from your own collection and external sources.

## Plugin

Install the plugin from the `Edgestream marketplace` with Codex CLI:

```bash
codex plugin marketplace add edgestream/agent-marketplace --ref development
codex plugin add recipes-dev@edgestream-dev
```

See [marketplace installation guide](https://github.com/edgestream/agent-marketplace#installation)
and [PLUGIN.md](docs/PLUGIN.md) for packaging and release details.

## MCP

Connect an MCP client to the development server using OAuth:

```text
https://recipes.dev.edgestream.cloud/mcp
```

Try the plugin's default prompts in order:

- “List my recipes”
- “Search recipes for spaghetti”
- “Show the details of the first recipe from those search results”
- “Import that recipe into my collection”

See the [ChatGPT guide](docs/CHATGPT.md) for setup and account connection and
the [MCP reference](docs/MCP.md) for capabilities and configuration.

## CLI

The CLI requires *Node.js 24* or later. From the repository root of a local
checkout, install the dependencies:

```bash
npm ci
```

Import, list, search, show, and delete a recipe:

```bash
# Import the example recipe.
npx recipes import https://raw.githubusercontent.com/edgestream/recipes-plugin/main/examples/spaghetti-carbonara.json

# List saved recipes.
npx recipes list

# Search for recipes.
npx recipes search Spaghetti

# Show a complete recipe.
npx recipes show spaghetti-carbonara

# Permanently delete the saved recipe.
npx recipes delete spaghetti-carbonara
```

See [CLI.md](docs/CLI.md) for commands, configuration, and URI rules.

## Development

```bash
npm run build
npm run check
npm test
```

See [AGENTS.md](AGENTS.md) for contribution guidance and project conventions.
