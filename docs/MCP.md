# MCP Interface

## Role

The MCP server is a presentation adapter over `RecipesService`. It validates MCP
input, translates application references to resources, and serializes results. It
must not construct providers, stores, resolvers, caches, or databases.

The stdio executable is assembled by `packages/runtime` and started from
`apps/mcp-server/src/main.ts`. Protocol logging goes to stderr; stdout is reserved
for MCP transport messages. `apps/mcp-server/src/web-main.ts` is a separate,
optional single-user Streamable HTTP entry point. Both transports call
`createRecipesMcpServer`; neither duplicates tool, resource, provider, or service
composition.

## Streamable HTTP deployment

The committed `dist/recipes-mcp-http.mjs` bundle serves MCP at `/mcp` and a
minimal non-MCP health check at `/health`. It uses the SDK's current Streamable
HTTP handler in stateless mode: each request receives the same registered MCP
surface, with JSON responses by default and request-scoped SSE whenever the
protocol handler needs a stream. It does not provide the obsolete standalone
HTTP-plus-SSE transport or persistent HTTP sessions.

Start it with Node 24 or later; no development dependencies are required at
runtime:

```bash
RECIPES_DATA_DIRECTORY=/path/to/recipes node ./dist/recipes-mcp-http.mjs
```

Configuration is deliberately environment-only:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RECIPES_MCP_HTTP_HOST` | `127.0.0.1` | Listener address. |
| `RECIPES_MCP_HTTP_PORT` | `3000` | Listener port. |
| `RECIPES_MCP_HTTP_ALLOW_REMOTE` | unset | Must be exactly `true` for a non-loopback listener. |
| `RECIPES_MCP_HTTP_PUBLIC_URL` | derived local `/mcp` URL | Public HTTP(S) `/mcp` URL printed at startup for reverse-proxy or tunnel deployments. |
| `RECIPES_MCP_HTTP_ALLOWED_ORIGINS` | loopback hostnames | Whitespace-separated browser origin hostnames permitted to make origin-bearing requests. |
| `RECIPES_DATA_DIRECTORY` | runtime default | Personal JSON collection location. |

Loopback is the safe default. A non-loopback setting emits a warning and is
refused unless explicitly enabled. A remotely reachable server must be behind
HTTPS and an authenticated reverse proxy or Secure MCP Tunnel; this repository
does not implement OAuth, TLS, or a public unauthenticated deployment. Set
`RECIPES_MCP_HTTP_ALLOWED_ORIGINS` only to trusted origin hostnames when a browser
client needs to send an `Origin` header. Requests are bounded to 1 MiB, validate
host and origin headers before MCP dispatch, and propagate a disconnected client
to the MCP request signal. HTTP errors and logs contain only short operational
messages, never recipe content, credentials, local paths, or stack traces.

`SIGINT` and `SIGTERM` stop the listener. The HTTP handler then aborts active
request work through the SDK and does not write the personal store itself.

## V1 surface

The configured runtime exposes these tools:

- `search_recipes`: paged free-text search returning recipe `ResourceLink` values;
- `get_recipe`: complete schema.org Recipe retrieval by provider and provider-local
  ID;
- `import_recipe`: non-idempotent import from a `recipes://` URI, path, file URI,
  HTTP URL, or HTTPS URL, with an optional stable personal ID.
- `delete_recipe`: permanently delete one recipe by provider and provider-local ID
  when the configured runtime supports deletion.

The default runtime exposes:

- static index resource `recipes://personal`;
- generic recipe template `recipes://{provider}/{id}` for every provider active
  in the runtime registry.

The complete collection is read through the static index resource. A runtime with
additional providers leaves large catalogs non-enumerated. The generic resource
handler validates the provider against that runtime registry before routing the
read. An unfiltered request to list or browse a collection uses its static index
resource; `search_recipes` requires non-empty query terms and is not a collection
listing mechanism. Search results are summary links; callers read the returned
resource or call `get_recipe` for the complete document.

Tools are registered from application capabilities. A read-only service without
search, import, or deletion must not advertise those tools.

## URI rules

The application codec owns canonical recipe URIs:

```text
recipes://{provider}/{encoded-id}
```

- The authority is the provider ID.
- The path contains exactly one encoded provider-local recipe ID.
- IDs are decoded before they reach the catalog.
- The internal URI is not written into the schema.org `Recipe.url` field.

Hierarchical collections use the planned convention:

```text
catalog://{provider}/{collection/path}
```

Collection resources are required for directory navigation but are not yet wired;
see the implementation gap in [ARCHITECTURE.md](ARCHITECTURE.md).

## Paging and result shape

MCP passes its cursor and limit to the provider-facing application request. The
default limit is 20; callers may request up to 100 results. The cursor is opaque to
MCP and must not be converted to a global numeric offset.

Search returns:

- MCP `resource_link` content for navigation;
- structured content with `provider`, `id`, `uri`, `name`, `description`, and
  `nextCursor`;
- optional `importSource`, a direct source URL that may be passed to
  `import_recipe` without replacing the provider-qualified resource URI.

`nextCursor` is `null` at the MCP boundary when no next page exists. Internally the
core page omits `nextCursor`.

Resource indexes may need to traverse all provider pages because MCP resource
listing returns a complete resource list. Page traversal must reject repeating
cursors.

## Error semantics

- Invalid tool input is rejected by Zod schemas.
- A recipe resource for a provider absent from the active runtime registry is
  rejected before a catalog read.
- `get_recipe` returns an MCP error result when the recipe is missing.
- Reading a missing concrete resource raises a resource-read error.
- Import is marked non-read-only and non-idempotent.
- Importing a `recipes://` URI reads that provider's recipe and passes the
  retrieved provenance to the personal writer.
- Deletion is marked non-read-only and destructive. A runtime without deletion
  capability does not advertise `delete_recipe`.
- Deletion for a provider not configured with a deleter returns an unsupported
  capability error; deleting a missing owned recipe returns a not-found error.
- Repeated automatic imports may receive suffixed IDs; an explicit conflicting ID
  is an error.
- Provider, network, parsing, size, timeout, and storage errors remain observable;
  do not silently fall back to another provider or the web.

A future Recipes MCP Profile should version tool schemas, structured output, URI
rules, paging, and error semantics before independently developed servers attempt
interoperability.

## Providers, servers, and extensions

An npm provider package, an independent MCP server, and an MCP Extension are
different mechanisms:

- A provider package implements core catalog contracts inside this application.
- An independent provider MCP is a separate server connection.
- An MCP Extension negotiates optional protocol behavior between an already
  connected client and server.

A `ResourceLink` contains a URI and metadata but no target server identifier.
Matching URI schemes do not create global routing. A host must retain the pair of
server connection and URI. MCP Registry discovery also does not replace runtime
routing.

Core MCP resources and tools are sufficient for the current workflow. Do not model
an internal catalog package as an MCP Extension. Consider an extension only after
multiple independent servers demonstrate a concrete federation requirement.

Provider availability is runtime configuration, not MCP federation. The runtime
passes its explicit provider registry to this adapter; MCP must not name or
construct individual providers itself.

## Manifests and runtime packaging

Two manifest pairs are maintained:

- portable plugin manifests: `plugin.json` and `mcp.json`;
- Codex plugin manifests: `.codex-plugin/plugin.json` and `.mcp.json`.

See [PLUGIN.md](PLUGIN.md) for the two target specifications and their manifest
responsibilities.

Keep overlapping command, argument, environment, version, and identity values in
sync. The installed runtime launches the committed self-contained bundle:

```text
node ./dist/recipes-mcp.mjs
```

Both bundled MCP configurations intentionally omit `cwd`. Codex starts a
plugin-provided stdio server from its installed plugin directory, so the relative
bundle argument resolves there. Do not set `cwd` to `.` and do not rely on an
undocumented `PLUGIN_ROOT` placeholder.

`RECIPES_DATA_DIRECTORY` is set to `${PLUGIN_DATA}` in plugin manifests. They do
not set `RECIPES_PROVIDERS`, so the runtime activates every provider known to its
registry. This keeps the adapter and runtime provider-neutral. Personal data
survives plugin upgrades. Installed plugin caches may not contain
`node_modules`, `tsx`, or development dependencies; runtime manifests must never
depend on them.

Rebuild and commit `dist/recipes-mcp.mjs` whenever MCP source, runtime composition,
runtime imports, dependencies, bundle options, or MCP manifests change.
Rebuild and commit `dist/recipes-mcp-http.mjs` whenever the HTTP entry point,
shared MCP presentation, runtime composition, or its bundle options change.

## Required verification

MCP behavior has two independent verification layers:

1. Protocol tests use an in-memory MCP client and server transport.
2. Release verification starts `dist/recipes-mcp.mjs` with Node and performs a real
   stdio handshake, tool listing, and resource listing.
3. HTTP integration tests start an ephemeral loopback listener and use a real
   Streamable HTTP client for initialization, discovery, tool calls, and resource
   reads. Also smoke-test the committed HTTP bundle with an isolated data directory.

Source-level tests alone do not prove that an installed plugin bundle starts. A
natural-language agent response also does not prove MCP use; verify actual protocol
calls when testing agent behavior.
