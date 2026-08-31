# Architecture

## Purpose

Recipes is a provider-neutral TypeScript foundation for reading and importing
schema.org Recipe documents through MCP or CLI. The current local runtime uses a
directly editable JSON file collection. Future catalogs, stores, caches, and
databases must be addable without changing the domain contracts or coupling a
provider to MCP.

The architecture optimizes for a small core, explicit capabilities, stable
identity, and independently testable adapters.

## Dependency direction

```text
apps/cli ---------+
                  +--> packages/runtime --> packages/application --> packages/core
apps/mcp-server --+          +-----------> packages/store-file ---> packages/core
                            +-----------> packages/provider-chefkoch -> packages/core
                             +-----------> packages/source-url ---> packages/core
```

Dependencies point inward:

- `packages/core` has no Node, MCP, CLI, storage, or provider dependency.
- `packages/application` depends only on the core contracts.
- Infrastructure adapters implement core ports.
- `packages/runtime` is the private composition root for concrete adapters.
- CLI and MCP translate their transports to application requests and responses.

Transport adapters must not construct stores, resolvers, caches, or providers.

## Module responsibilities

### `packages/core`

The core defines transport-neutral data and ports:

- `RecipeDocument` is normalized schema.org data.
- `RecipeRef` is the provider-qualified application identity.
- `RecipeRecord` combines a reference, document, and optional provenance.
- `RecipeSummary` is the list and search projection and may expose an optional
  direct `importSource` without replacing its internal reference.
- `RecipeCatalog` provides `get` and paged `list`.
- `RecipeSearch` is an optional paged search capability.
- `RecipeWriter` creates owned records.
- `RecipeResolver` resolves one import source.
- `RecipeCollections` represents optional hierarchical navigation.

Read, write, import, search, and collection navigation are separate capabilities.
A read-only provider must never implement a fake writer.

### `packages/application`

`RecipesService` exposes the use cases shared by every frontend:

- get a recipe;
- list recipes;
- search recipes;
- list collections when supported;
- import through a resolver and writer when supported.

The service exposes configured capabilities so frontends do not advertise
unavailable operations. Application reference codecs translate between
provider-qualified references and public URIs.

### `packages/store-file`

`FileStore` is the personal catalog and writer backed by JSON files. It owns file
layout and provider-local IDs, but it does not own MCP or CLI URI construction.

### `packages/source-url`

`UrlSource` resolves file, HTTP, and HTTPS input. Fetching and JSON-LD extraction
are separate modules. The adapter applies time and size limits and returns source
provenance without replacing schema.org identity fields.

### `packages/provider-chefkoch`

The Chefkoch workspace package is a read-only `RecipeCatalog` and `RecipeSearch`.
It depends only on core contracts and receives its document resolver through its
constructor. Its provider-specific network method, validation, and operational
limits belong in the package README, not in this general architecture document.

### `packages/runtime`

The runtime reads process configuration and constructs the concrete local
application. Both executable frontends use the same runtime so environment and
adapter behavior cannot drift.

The runtime has an explicit, static provider registry. It constructs only the
provider packages declared as runtime dependencies; it never discovers packages
dynamically. `RECIPES_PROVIDER` chooses the default provider for provider-local
frontend inputs and defaults to `personal`. `RECIPES_PROVIDERS` is a
whitespace-separated list of additional enabled provider IDs when it is set. When
it is absent, every provider known to the runtime registry is active. An explicitly
empty value enables no additional providers. The personal file provider is always
active because it owns the import target and enumerable index.

`CombinedCatalog` is a reusable runtime composition adapter for a known set of
providers. It lists through one designated catalog, routes `get` by provider ID,
and runs search in parallel. Its result order follows provider registration order;
it intentionally has no compound cursor.

CLI and MCP searches both default to 20 results. The CLI presents only that first
page; MCP exposes its cursor for callers that need more pages.

### `apps/cli` and `apps/mcp-server`

The apps own only transport parsing, validation, presentation, and process startup.
Their public behavior is documented in [CLI.md](CLI.md) and [MCP.md](MCP.md).

## Identity and documents

Schema.org identity and application identity are different concepts:

```ts
type RecipeRecord = {
  ref: { provider: string; id: string };
  document: RecipeDocument;
  provenance?: { source: SourceRef };
};
```

- `document.url` and `document["@id"]` remain source data.
- `ref.provider` selects the catalog.
- `ref.id` is the stable identity inside that catalog.
- MCP and CLI may encode a reference as `recipes://{provider}/{id}`.
- Storage adapters must not persist an internal URI as the schema.org URL.
- A `recipes://` URI is a catalog-local import reference. The application resolves
  it through that catalog before passing the retrieved document to the personal
  writer. `RecipeSummary.importSource`, when present, is an optional direct source
  URL; it is not an alternative recipe identity.

Recipe IDs may contain characters that require URI encoding, but they must be safe
provider-local names without path separators. A copied JSON filename remains the
personal recipe ID.

## Catalog invariants

Every catalog implementation must satisfy these rules:

1. Every returned `RecipeSummary.ref` is readable by `get` on the same catalog.
2. Cursors are opaque outside the provider.
3. Paging and ordering are stable for an unchanged catalog.
4. A foreign provider reference is not resolved accidentally.
5. Missing records return `undefined`; conflicts use a typed conflict error.
6. Callers may cancel local or remote work through `RequestContext.signal`.

## Import paths

The shared import use case accepts either a source reference (path, file URI, or
HTTP(S) URL) or a provider-qualified recipe reference. Source imports use a
`RecipeResolver`. Reference imports read the catalog first, then create a personal
record while passing along the read record's provenance. This lets a provider
retain its original retrieval method and source URL without exposing that URL in
every search result.

The CLI and MCP only parse the public recipe URI and call this shared use case;
they do not name or construct providers.

Reusable tests in `test/contracts/` enforce common store behavior. Future provider,
database, and cache adapters must test the catalog capabilities they implement.

## Personal file collection

Personal recipes are raw schema.org Recipe JSON files. Users must be able to copy,
rename, and edit them without running an import command and without updating a
metadata index.

Required directory collection semantics are:

- `data/<id>.json` is a recipe in the root collection.
- Subdirectories below `data/` are nested collections.
- Listing a collection returns recipes directly inside that collection.
- Navigation returns its direct child collections.
- Search from the root is recursive unless a collection scope narrows it.
- Recipe IDs are filenames and must be unique across the personal tree so a
  provider-qualified recipe reference remains independent from folder placement.
- Moving a file between collections must not change its recipe reference.
- Duplicate IDs in different directories are an explicit data error.

### Current implementation gap

The `RecipeCollections` port exists, but the current implementation reads only
root-level files in `FileStore`, runtime, CLI, and MCP. Therefore a collection
containing only `data/pasta/spaghetti-carbonara.json` currently appears empty at
the root. The directory semantics above remain a design target until navigation is
wired through all layers and covered by contract, CLI, and MCP tests.

## Extension model

### Provider packages

Every provider package implements `RecipeCatalog` and optional capabilities from
`@edgestream/recipes-core`. It has no MCP or CLI dependency. A provider may first
be developed as a workspace package with its own package manifest and TypeScript
project. It can later be separately installed and versioned outside this repository
without changing the core boundary; runtime composition replaces the local `file:`
dependency with a versioned package or GitHub reference.

See [PROVIDER.md](PROVIDER.md) for the package contract, runtime activation,
provider URI imports, upstream safety, and provider test guidance.

The runtime registry is introduced with the second real catalog. Do not add
speculative dynamic package discovery.

### Import sources

A source package implements `RecipeResolver` for one source type. Resolving one
import reference is different from exposing a searchable provider catalog.

### Databases

A database adapter implements the catalog and writer ports it actually supports.
It should use native paging, ordering, uniqueness, and transactions rather than
emulating file-store behavior in the application layer.

### Caches

A cache decorates read ports such as `RecipeCatalog` and `RecipeSearch`. It must not
be forced to implement writing or import. Cache keys include the provider-qualified
reference, and invalidation follows the wrapped provider or writer semantics.

### Aggregation

`CombinedCatalog` provides intentionally small in-process aggregation: it preserves
provider-qualified references, uses registration order, and rejects cursors for
combined search. Result deduplication, partial-failure policy, and cross-provider
paging require an explicit product decision before being added.

## Scope and non-goals

The current V1 is read-oriented plus import. Save, update, patch, synchronization,
background indexing, permissions, result deduplication, partial provider failures,
and cross-provider paging are outside scope until explicitly designed.

MCP protocol federation is not the internal extension mechanism. See [MCP.md](MCP.md)
for the boundary between provider packages, independent MCP servers, and MCP
Extensions.
