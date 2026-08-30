# Repository Instructions for AI Agents

These instructions apply to the complete repository.

## Required context

Read the project documentation before changing code or public behavior:

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for every architectural,
  storage, provider, cache, database, or module-boundary change.
- Read [docs/MCP.md](docs/MCP.md) for every MCP tool, resource, manifest,
  packaging, or runtime change.
- Read [docs/PLUGIN.md](docs/PLUGIN.md) for every plugin manifest, plugin
  packaging, install-surface metadata, or target-specification change.
- Read [docs/CLI.md](docs/CLI.md) for every CLI command, option, output, exit-code,
  or local-runtime change.
- Read `README.md` when changing end-user setup or examples.

If requested work conflicts with a documented invariant, point out the conflict
before implementation. Do not silently replace an architectural decision.

## Project invariants

- Keep one Node/TypeScript toolchain and English code, comments, errors, and
  repository documentation.
- Keep `packages/core` independent of Node, MCP, CLI, and concrete providers.
- Keep schema.org recipe data separate from provider-qualified application
  identity. Never replace a source `Recipe.url` with an internal URI.
- A catalog result must be readable through the same catalog.
- Keep read-only catalogs independent from writers and import resolvers.
- Keep MCP and CLI as thin adapters over the shared application service and
  runtime composition root.
- External provider packages depend on the core contracts, not on MCP or CLI.
- Preserve directly editable JSON files. Do not introduce a mandatory metadata
  index for the personal file store.
- Keep V1 read-oriented plus `import_recipe`. Do not add update, save, patch, or
  synchronization commands without an explicit scope decision.
- Treat files below `data/` as user data. Do not delete, rewrite, or commit them
  unless the user explicitly requests it.

## Documentation maintenance

Documentation is part of the implementation, not a follow-up task.

- Update `docs/ARCHITECTURE.md` when modules, dependencies, core contracts,
  identity, paging, provider, storage, cache, or database decisions change.
- Update `docs/MCP.md` when MCP tools, resources, schemas, URIs, capabilities,
  errors, manifests, bundles, or protocol behavior change.
- Update `docs/PLUGIN.md` when portable or Codex plugin manifests, their
  compatibility contracts, install-surface metadata, or shared runtime settings
  change.
- Update `docs/CLI.md` when commands, arguments, output, configuration, URI
  handling, or exit behavior change.
- Keep `README.md` concise and end-user-oriented. Link or route deeper knowledge
  through this file and `AGENTS.md` instead of duplicating architecture prose in
  the README.
- Record known implementation gaps in the relevant document. Remove the gap note
  in the same change that closes it.
- When code and documentation disagree, resolve the disagreement before pushing.

## GitHub issues

When creating or updating a GitHub issue or pull request, follow
[docs/ISSUES.md](docs/ISSUES.md). Every issue must have a complete title and
description plus verified Type, Priority, and Effort metadata. Every pull
request that implements an issue must be linked to it as documented there. Do
not claim metadata was set if the available GitHub credentials cannot write it.
When a pull request title uses a Conventional Commit prefix such as `feat:`,
`fix:`, or `docs:`, begin the summary after the prefix with a lowercase letter;
retain capitalization for proper names and acronyms.

## Implementation workflow

1. Inspect the branch, worktree, and user-owned changes before editing.
2. Read the relevant documents listed above.
3. Make the smallest coherent change that preserves the documented boundaries.
4. Add or update tests at the lowest useful layer. Reusable adapters should run
   the catalog contract tests.
5. Rebuild committed runtime bundles when their sources or dependencies change.
6. Update documentation before the final commit.

## Required routine before every push

Run these checks from the repository root:

```bash
npm run build
npm run check
npm test
git diff --check
git status --short
```

Then verify all of the following:

- The worktree is clean after the final commit.
- `dist/recipes-cli.mjs` and `dist/recipes-mcp.mjs` were rebuilt and committed
  whenever their runtime inputs changed.
- `plugin.json` and `mcp.json` remain synchronized with their Codex counterparts
  `.codex-plugin/plugin.json` and `.mcp.json` where their shared values overlap.
- MCP changes have both an in-memory protocol test and, for runtime or bundle
  changes, a real stdio handshake against `dist/recipes-mcp.mjs`.
- CLI runtime changes have a smoke test against `dist/recipes-cli.mjs` with an
  isolated `RECIPES_DATA_DIRECTORY`.
- The relevant files under `docs/` describe the final behavior and no resolved
  gap remains documented as open.

Do not push generated bundles that differ from their current source, uncommitted
user changes, or architecture changes that have not been documented.
