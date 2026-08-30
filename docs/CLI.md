# CLI Interface

## Role

The CLI is a thin frontend over the same `RecipesService` and local runtime used by
MCP. It parses arguments, calls one use case, formats stdout, reports diagnostics on
stderr, and sets a meaningful exit code. It must not construct a store or source.

## Commands

```text
recipes import <url-or-path> [--id <id>]
recipes list
recipes search <query>
recipes show <id|recipes://provider/id>
```

- `import` prints the created provider-local ID.
- `list` prints `id: name` for every recipe page.
- `search` prints `id: name` for every matching page.
- `show` prints the complete schema.org Recipe JSON document.
- Invalid commands and arguments produce a diagnostic and non-zero exit code.

Human-readable output is the default. A machine-readable output mode may be added
later, but its schema and compatibility policy must be designed explicitly.

## Configuration

`packages/runtime` reads shared process configuration:

- `RECIPES_DATA_DIRECTORY` selects the personal file collection and defaults to
  `./data`.
- `RECIPES_PROVIDER` selects the provider ID and defaults to `personal`.

CLI and MCP must use the same configuration function. An environment option must
not work in one frontend and be ignored in the other.

## References

Commands accept provider-local IDs where the provider is unambiguous. `show` also
accepts a canonical `recipes://{provider}/{encoded-id}` URI. URI parsing and
validation are shared with MCP through `packages/application`.

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

Rebuild it whenever CLI source, application behavior, runtime composition, runtime
imports, dependencies, or bundle options change.

A CLI runtime smoke test must use an isolated data directory and execute the bundle,
not only TypeScript source. At minimum it should import a fixture, list the resulting
recipe, and confirm that `RECIPES_DATA_DIRECTORY` is honored.
