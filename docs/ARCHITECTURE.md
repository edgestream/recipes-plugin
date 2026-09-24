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
- `RecipeDeleter` removes owned records.
- `RecipeResolver` resolves one import source.
- `RecipeCollections` represents optional hierarchical navigation.

Read, creation, deletion, import, search, and collection navigation are separate
capabilities. A read-only provider must never implement fake mutation
capabilities.

### `packages/application`

`RecipesService` exposes the use cases shared by every frontend:

- get a recipe;
- list recipes;
- search recipes;
- list collections when supported;
- import through a resolver and writer when supported;
- delete through a deleter when supported.

The service exposes configured capabilities so frontends do not advertise
unavailable operations. Application reference codecs translate between
provider-qualified references and public URIs.

### `packages/store-file`

`FileStore` is the personal catalog, writer, and deleter backed by JSON files. It owns file
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
adapter behavior cannot drift. Hosted HTTP composition receives only an already
verified, unexpired adapter `(issuer, subject)` principal and derives an opaque
SHA-256 namespace below its mounted data root. The hosted file store rejects a
symbolic-link collection root and opens recipe and provenance files without
following symbolic links. OAuth stays in the HTTP adapter;
core, CLI, and stdio remain OAuth-independent. The HTTP adapter creates that
runtime only after every data-bearing request passes fresh verification and its
operation scope check; public initialization and tool-schema discovery do not
read or write a collection. Changing issuer is an explicit owner migration,
never an automatic email-based merge.

The runtime has an explicit, static provider registry. It constructs only the
provider packages declared as runtime dependencies; it never discovers packages
dynamically. `RECIPES_PROVIDER` chooses the default provider for provider-local
frontend inputs and defaults to `personal`. `RECIPES_PROVIDERS` is a
whitespace-separated list of additional enabled provider IDs when it is set. When
it is absent, every provider known to the runtime registry is active. An explicitly
empty value enables no additional providers. The personal file provider is always
active because it owns the import target and enumerable index.

Hosted collections additionally enable source idempotency. For an import without
an explicit personal ID, the file store compares the URL resolver's final,
canonical source URL with persisted provenance in that account's namespace. A
match returns the existing record; it does not create or refresh a second
record. The check and creation share the collection's write serialization, so
concurrent requests in the single-writer hosted process have the same result,
and provenance survives a normal process restart. This is scoped to each opaque
issuer/subject namespace: equal sources in different accounts remain separate.
Local CLI and stdio collections retain their existing non-idempotent import
behavior.

Hosted collections have a bounded aggregate byte quota (2 MiB by default,
operator-configurable at composition). The file store serializes creates for one
directory in the hosted process, calculates the quota before publishing either
the recipe or its provenance sidecar, writes temporary files exclusively, and
publishes them by no-clobber hard link. This deliberately requires a
single-writer mounted volume; horizontal multi-process file-store coordination
is not implemented. Directly copied files remain editable, but an operator must
not grant untrusted filesystem write access to the mounted root.

Hosted source fetching is a runtime-composed provider capability, not a generic
URL fetch. Hosted production imports accept provider-qualified references only;
the provider registry supplies the statically known public endpoints. Direct URL
imports have an explicitly test-only feature gate and are off by default. The
hosted client performs a fresh DNS resolution for each hop, rejects non-public
answers, then pins the accepted address into the socket lookup used for that
hop. This prevents a separate check/connect lookup from being changed by DNS
rebinding. Redirects receive the same treatment. Decoded response bytes are
bounded while streaming; hosted request and concurrency budgets are shared by
opaque account namespace and by the process. The same client is injected into
provider network calls, and it strips authentication and cookie headers so MCP
OAuth credentials cannot reach recipe origins.

`CombinedCatalog` is a reusable runtime composition adapter for a known set of
providers. It lists through one designated catalog, routes `get` by provider ID,
and runs search in parallel. Its result order follows provider registration order;
it intentionally has no compound cursor.

CLI and MCP searches both default to 20 results. The CLI presents only that first
page; MCP exposes its cursor for callers that need more pages.

### `apps/cli` and `apps/mcp-server`

The apps own only transport parsing, validation, presentation, and process startup.
The MCP app has separate stdio and Streamable HTTP entry points, both creating a
fresh presentation server through `createRecipesMcpServer` and the same runtime
composition root. The HTTP adapter is a single-user, stateless request adapter;
it owns HTTP body limits, host/origin checks, cancellation, and listener
lifecycle, but not recipe behavior or provider construction.
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

An imported record may have an adjacent optional `<id>.personal.json` provenance
sidecar. It records only the import source and is not a recipe, catalog index, or
requirement for manually managed JSON files. Hosted source idempotency consults
only valid sidecars; missing, malformed, or legacy sidecars are left untouched
and cannot be deduplicated automatically. Deleting a managed record removes its
sidecar. This preserves direct editing and avoids assigning or cleaning up
existing user data.

For a controlled file-store restore, copy only disposable or otherwise
authorized namespace directories to a separate mounted restore root, then use
the same verified issuer/subject pair to read them. This validates application
namespace continuity only; it is not a claim that the OAuth platform, identity
provider, volume snapshots, or the broader production backup strategy are
recoverable.

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

The current V1 supports reading, importing, and deleting individual recipes where
the configured catalog exposes those capabilities. Save, update, patch,
synchronization, background indexing, permissions, result deduplication, partial
provider failures, and cross-provider paging are outside scope until explicitly
designed.

MCP protocol federation is not the internal extension mechanism. See [MCP.md](MCP.md)
for the boundary between provider packages, independent MCP servers, and MCP
Extensions.
