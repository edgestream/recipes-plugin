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

For the verified user-facing ChatGPT development connection, including its
remote OAuth MCP endpoint and the distinction from a Directory publication, see
[CHATGPT.md](CHATGPT.md). The portable package files do not make the bundled
stdio server a directly connectable ChatGPT server.

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

The starter prompts in `.codex-plugin/plugin.json` (`interface.defaultPrompt`)
are the source for the README examples. Update both together. They use provider
search results for imports so they also work with the hosted source policy.

Both MCP configurations launch the committed `node ./dist/recipes-mcp.mjs`
bundle without a `cwd` entry. Codex resolves the relative bundle argument from
the installed plugin directory; do not set `cwd` to `.` or use an undocumented
`${PLUGIN_ROOT}` placeholder. Both configurations set `RECIPES_DATA_DIRECTORY`
to `${PLUGIN_DATA}` so personal recipe data persists across plugin upgrades, and
intentionally omit
`RECIPES_PROVIDERS`. An unset selection activates every provider known to the
runtime registry, including Chefkoch. This is packaged runtime configuration; it
does not introduce a provider dependency into MCP or CLI.

The optional `dist/recipes-mcp-http.mjs` bundle is not referenced by either
plugin manifest. Plugin installation continues to launch stdio only; HTTP is a
deliberately separate single-user deployment surface documented in [MCP.md](MCP.md).

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

## Release and marketplace registration

Recipes is not yet registered in the marketplace. After release verification,
publish the release tag and GitHub release from this repository with matching
manifest versions and the intended release identity. Then propose the stable
listing in a separate `edgestream/agent-marketplace` PR pinned to the published
tag. Publishing the release alone does not register the plugin.

Follow the [marketplace promotion guide](https://github.com/edgestream/agent-marketplace/blob/main/docs/PROMOTION.md)
for tag/commit verification, listing review, and installed-host checks. Record
actual ChatGPT compatibility before advertising support. Installation and channel
instructions belong in the [marketplace guide](https://github.com/edgestream/agent-marketplace#installation).
Marketplace registration is separate from public ChatGPT Directory approval;
neither is established by the existing development OAuth connection.
