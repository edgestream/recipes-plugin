# Chefkoch Provider

`@edgestream/recipes-provider-chefkoch` is a read-only Recipes catalog package.
It searches public Chefkoch recipe results and resolves an individual recipe from
the canonical public recipe page. It deliberately has no MCP, CLI, file-system,
cache, import, or write dependency.

The repository-wide [provider package guide](../../docs/PROVIDER.md) describes
the shared catalog, identity, activation, import, test, and delivery rules. This
README records only Chefkoch-specific behavior.

## Network method

Search sends `query`, `limit`, and `offset` to the undocumented
`https://api.chefkoch.de/v2/search-gateway/recipes` endpoint. The adapter accepts
only result URLs on `https://www.chefkoch.de/rezepte/{numeric-id}/...` and exposes
them as optional `RecipeSummary.importSource` values. A caller normally imports
the provider-qualified `recipes://chefkoch/{id}` reference instead; the host
application resolves that reference through this catalog and passes the page URL
to the personal writer as provenance.

`get()` derives `https://www.chefkoch.de/rezepte/{numeric-id}/` from a
provider-qualified reference. The injected `RecipeResolver` retrieves the page and
extracts its schema.org Recipe JSON-LD. The source document's `url` and `@id` are
never replaced by a `recipes:` URI.

The search endpoint is unofficial and may change or become unavailable. This
package is not an authorization to use the service: maintainers must verify the
applicable terms and acceptable request rate before enabling it for users.

## Operational boundaries

- No authentication, cookies, bulk crawling, background indexing, or persistent
  cache is implemented.
- Search response size is limited to 2 MiB and requests time out after 15 seconds
  by default. Both values are constructor options.
- Provider, network, parsing, and protocol errors are propagated. Invalid gateway
  result URLs are rejected rather than being handed to importers.
- Tests use injected fetch and resolver implementations. Live requests are not
  part of the automated test suite.

## Workspace and extraction

The package is developed in this workspace through its own package manifest and
TypeScript project. It can later move to another repository without changing its
public package name or core-only dependency boundary; the runtime dependency can
then change from a local `file:` reference to a versioned npm or GitHub reference.
