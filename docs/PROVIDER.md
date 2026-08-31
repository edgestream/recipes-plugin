# Provider Packages

## Purpose

A provider package makes a recipe catalog available to the shared Recipes
application. It is not an MCP server, CLI command, importer, or personal store.
Providers expose provider-qualified recipe references; the runtime composes them,
and the CLI and MCP present them without naming concrete providers.

This document records the common provider contract. A package README documents
provider-specific access methods, operational limits, terms, and known gaps.

## Package boundary

A provider package:

- depends on `@edgestream/recipes-core`, but never on MCP, CLI, runtime, or a
  personal writer;
- implements `RecipeCatalog` and, when applicable, `RecipeSearch`;
- remains read-only unless a separate, explicitly designed capability requires
  writing;
- receives shared collaborators such as a `RecipeResolver` through its
  constructor instead of constructing application infrastructure itself; and
- has its own `package.json`, `tsconfig.json`, `src/`, generated `dist/`, tests,
  and README.

The first version of a provider may live in `packages/provider-<name>` as a
workspace package. It can later move to a separately versioned repository without
changing this boundary: replace the runtime's local `file:` dependency with a
versioned npm or GitHub dependency.

## Identity and catalog contract

`RecipeRef { provider, id }` is application identity. A provider chooses a stable
provider ID and stable provider-local IDs; MCP and CLI encode them as:

```text
recipes://{provider}/{encoded-id}
```

The following rules are mandatory:

1. Every `RecipeSummary.ref` returned by search or list must be readable through
   `get()` on the same provider.
2. `get()` must reject or return `undefined` for a reference belonging to another
   provider.
3. Provider cursors are opaque outside the provider and ordering is stable while
   the upstream catalog is unchanged.
4. Source schema.org `url` and `@id` remain source data. Never replace them with
   a `recipes:` URI.
5. A summary may expose an optional `importSource` URL, but that URL supplements
   the provider reference and never becomes its identity.

The search result's `recipes://` URI is the normal import target. The shared
application reads the referenced provider record, then passes its document and
provenance to the personal writer. Therefore a provider must be able to retrieve a
recipe from its reference without relying on search-result state. The CLI keeps
search output readable by displaying only the URI and title.

## Runtime registration and activation

`packages/runtime` owns an explicit static registry of provider factories. Adding
a provider means adding its runtime dependency and one registry entry; do not add
dynamic package discovery or frontend-specific provider branches.

The registry controls active providers for both CLI and MCP:

| Environment state | Active providers |
| --- | --- |
| `RECIPES_PROVIDERS` is absent | Every provider known to the runtime registry |
| `RECIPES_PROVIDERS="chefkoch other"` | The named additional providers |
| `RECIPES_PROVIDERS=""` | No additional providers |

The personal file provider is always active because it owns imports, storage, and
the enumerable index. `RECIPES_PROVIDER` only selects the default provider for
provider-local frontend inputs; it does not disable other active providers.

Plugin manifests intentionally omit `RECIPES_PROVIDERS` so a newly registered
provider is enabled by default after installation. An explicit manifest value is a
release-level selection and must be synchronized across portable and Codex
manifests.

## Frontend behavior

MCP exposes the generic `recipes://{provider}/{id}` resource template and routes
it through the active runtime registry. It must not register provider-specific
templates or construct providers. `import_recipe` accepts the same recipe URI as
the CLI `import` command, in addition to paths and source URLs.

CLI search returns the first 20 provider-qualified references without appending
source URLs. MCP also defaults to 20 results but exposes an opaque cursor and may
accept an explicit limit up to 100. Combined cross-provider paging, result
deduplication, and partial-provider failure policy remain unimplemented until they
receive a separate product decision.

## Network and upstream safety

Provider adapters often depend on undocumented or changing upstream interfaces.
Keep the operational contract explicit and narrow:

- inject `fetch` and document resolvers for deterministic tests;
- set bounded request timeouts and response-size limits;
- validate every upstream response before creating a reference or import source;
- restrict canonical URLs to the expected protocol, host, path shape, and ID;
- propagate provider, network, parsing, and protocol failures rather than silently
  falling back to another provider or the web; and
- do not add authentication, cookies, bulk crawling, background indexing, or a
  persistent cache without an explicit scope decision.

The package README must state whether its access method is official, the expected
request behavior, and the terms or rate-limit review that maintainers must perform
before enabling it for users.

## Tests and delivery

Test a provider at its own boundary with injected collaborators. Cover successful
search mapping, cursor behavior, `get()` from a provider reference, foreign
references, malformed upstream data, and rejected unsafe URLs. Run the applicable
catalog contract tests for every catalog capability implemented by the provider.
Live upstream requests are smoke checks, not automated test fixtures.

When a provider changes runtime composition, update
[ARCHITECTURE.md](ARCHITECTURE.md), [CLI.md](CLI.md), [MCP.md](MCP.md), and this
document as appropriate. Rebuild the committed CLI and MCP bundles, validate the
manifests, and verify an installed plugin cache after release. Provider-specific
network details belong in that package's README rather than general documentation.
