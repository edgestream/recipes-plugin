# CLI Interface

## Role

The CLI is a thin frontend over the same `RecipesService` and local runtime used by
MCP. It parses arguments, calls one use case, formats stdout, reports diagnostics on
stderr, and sets a meaningful exit code. It must not construct a store or source.

## Commands

```text
recipes import <url-or-path|recipes://provider/id> [--id <id>]
recipes list
recipes search <query>
recipes show <id|recipes://provider/id>
```

- `import` accepts a path, URL, or provider-qualified recipe URI and prints the
  created personal ID. URI imports read through the referenced provider before
  storing the recipe personally.
- `list` prints `id: name` for every recipe page.
- `search` prints `recipes://provider/id: name` for every returned match, so results
  from different providers remain unambiguous. It prints the first 20 matches and
  does not append provider source URLs; pass the displayed URI to `import` instead.
- `show` prints the complete schema.org Recipe JSON document.
- Invalid commands and arguments produce a diagnostic and non-zero exit code.

Human-readable output is the default. A machine-readable output mode may be added
later, but its schema and compatibility policy must be designed explicitly.

## Configuration

`packages/runtime` reads shared process configuration:

- `RECIPES_DATA_DIRECTORY` selects the personal file collection and defaults to
  `./data`.
- `RECIPES_PROVIDER` selects the default provider for a provider-local `show` ID
  and MCP's default provider; it defaults to `personal`.
- When `RECIPES_PROVIDERS` is absent, every provider known to the runtime registry
  is active. When it is set, its whitespace-separated list (for example
  `chefkoch`) is the explicit additional-provider selection. An explicitly empty
  value selects no additional providers. The personal provider remains active as
  the import, storage, and enumerable collection provider.

CLI and MCP must use the same configuration function. An environment option must
not work in one frontend and be ignored in the other.

## References

Commands accept provider-local IDs where the provider is unambiguous. `show` and
`import` also accept a canonical `recipes://{provider}/{encoded-id}` URI. URI
parsing and validation are shared with MCP through `packages/application`. A URI
import reads the recipe from its provider and passes that provider's source
provenance to the personal writer.

The displayed recipe document preserves its schema.org source URL. Internal recipe
URIs are navigation references, not replacements for `Recipe.url`.

## Directory collections

The intended collection workflow is:

```text
recipes list [catalog://personal[/collection/...]]
recipes search [--scope catalog://personal[/collection/...]] <query>
```

At the root, directory collections should be displayed alongside directly contained
recipes. Search without a scope is recursive. This behavior is not implemented in
the current baseline. Until the gap is closed, recipes located only in a
subdirectory are absent from `recipes list`.

When implementing the port, keep command parsing and formatting in `apps/cli` and
all collection behavior in the application and adapter layers.

## Packaging and verification

The committed self-contained CLI bundle is:

```text
dist/recipes-cli.mjs
```

The root `package.json` maps the `recipes` executable directly to this committed
bundle. This mapping ensures that `npx recipes` inside a repository checkout uses
the local CLI instead of resolving the unrelated `recipes` package from the npm
registry. Keep the root manifest and lockfile mapping synchronized.

Rebuild it whenever CLI source, application behavior, runtime composition, runtime
imports, dependencies, or bundle options change.

A CLI runtime smoke test must use an isolated data directory and execute the bundle,
not only TypeScript source. At minimum it should import a fixture, list the resulting
recipe, and confirm that `RECIPES_DATA_DIRECTORY` is honored.
