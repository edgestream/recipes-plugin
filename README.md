# Recipes Plugin
Search and retrieve cooking recipes from your own collection and external sources

## CLI

Import the example recipe

```bash
$ npx recipes import https://raw.githubusercontent.com/edgestream/recipes-plugin/main/examples/spaghetti-carbonara.json
spaghetti-carbonara
```

List the recipes in the collection

```bash
$ npx recipes list
spaghetti-carbonara: Spaghetti Carbonara with Guanciale and Pecorino
```

Search through the collection

```bash
$ npx recipes search Spaghetti
recipes://personal/spaghetti-carbonara: Spaghetti Carbonara with Guanciale and Pecorino
```

Show a complete recipe document

```bash
$ npx recipes show spaghetti-carbonara
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "@id": "https://github.com/edgestream/recipes-plugin/blob/main/examples/spaghetti-carbonara.json",
  "name": "Spaghetti Carbonara with Guanciale and Pecorino",
  ...
}
```

## Development

Install dependencies, type-check the workspace, and run the test suite

```bash
npm install
npm run build
npm run check
npm test
```

`npm run build` creates self-contained Node bundles in `dist/`: `recipes-mcp.mjs`
for the plugin runtime and `recipes-cli.mjs` for the CLI. In the workspace,
`npx recipes <command>` runs the compiled CLI. Set `RECIPES_DATA_DIRECTORY` to
use a collection outside the current directory.

Provider package design and contribution guidance is in
[docs/PROVIDER.md](docs/PROVIDER.md).
