# Plugin Packaging

This repository ships two manifest pairs for the same bundled Recipes MCP
server. They target two distinct plugin contracts and are intentionally kept in
parallel.

| Target | Specification | Manifest files |
| --- | --- | --- |
| ChatGPT | [Agent Plugin Specification 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) | `plugin.json`, `mcp.json` |
| Codex | [Codex Plugins](https://developers.openai.com/plugins/build/plugins) | `.codex-plugin/plugin.json`, `.mcp.json` |

## Agent Plugins for ChatGPT

The portable pair targets Agent Plugin Specification 1.0.0. The root
`plugin.json` declares the canonical 1.0.0 plugin schema and contains portable
plugin metadata. `mcp.json` declares the matching 1.0.0 MCP schema and configures
the `recipes` stdio server.

Keep `mcpServers` out of the portable `plugin.json`: Agent Plugins discovers the
MCP configuration from the separate root `mcp.json`. The two `$schema` values
must target the same specification version.

## Codex Plugins

Codex discovers its plugin through `.codex-plugin/plugin.json`. This manifest
contains Codex install-surface metadata in `interface` and points `mcpServers` at
the root `.mcp.json`. The latter contains Codex's native bundled-MCP server map.

The Codex `interface.capabilities` contains both `Read` and `Write`: recipe search
and retrieval are read operations, while `import_recipe` persists a recipe in the
personal collection.

Only `plugin.json` belongs below `.codex-plugin/`; `.mcp.json` remains at the
plugin root. All manifest paths are relative to that root and begin with `./`.

## Shared runtime and maintenance

Both MCP configurations launch the committed `node ./dist/recipes-mcp.mjs`
bundle and set `RECIPES_DATA_DIRECTORY` to `${PLUGIN_DATA}` so personal recipe
data persists across plugin upgrades.

Keep the following values synchronized wherever both contracts express them:

- plugin identity and metadata: name, version, description, author, repository,
  and keywords;
- MCP server name, command, arguments, and runtime environment;
- user-facing intent: the Codex `interface` description and starter prompts must
  accurately represent the same Recipes service.

Validate all four files as JSON and run the repository checks before release:

```bash
npm run build
npm run check
npm test
git diff --check
```
