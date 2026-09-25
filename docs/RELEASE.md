# Release procedure

This document defines the release process. Release tooling is ordinary development
work on `main`; it neither authorizes nor performs publication. Commit and pull
request conventions remain in [REPOSITORY.md](REPOSITORY.md) and
[ISSUES.md](ISSUES.md); plugin packaging is in [PLUGIN.md](PLUGIN.md).

## Branches, versions, and channels

| Purpose | Branch | Plugin identity / display name | Version example |
| --- | --- | --- | --- |
| Development | `main` | `recipes-dev` / `Recipes Dev` | `0.2.0` |
| Maintenance of the 0.1 line | `release/0.1` | `recipes` / `Recipes` | `0.1.0`, then `0.1.1` |

Use plain `major.minor.patch` versions with no `v` prefix, prerelease suffix, or
build metadata. During 0.x development, create one maintenance branch per
released minor line. Immutable tags identify releases: never move or reuse a
published tag. After cutting a maintenance line, advance `main` independently to
the next development version; do not merge the stable identity into `main`.

## Version inventory and preparation

The root `package.json` is the authoritative product version. The preparation
script changes only release metadata:

- Root/workspace package manifests discovered through the root workspace patterns
  and their npm v3 lockfile entries. External dependency versions and integrity
  metadata remain unchanged.
- `plugin.json` and `.codex-plugin/plugin.json`: product version, channel
  identity, and matching display name.
- `apps/mcp-server/src/version.ts`, a generated committed module used by both
  bundled MCP transports. This embeds the version in standalone bundles without a
  runtime `package.json` dependency; explicit caller overrides remain available.

Recipes has no release-qualified provider User-Agent, so unlike Feeds there is
no provider version module to generate. Schema/protocol versions, provider IDs,
MCP identifiers, recipe URIs, dependency ranges, test-client versions, and
historical examples are independent values and are not changed globally.

```bash
# Preview without changing files.
npm run release -- 0.1.0 --channel stable

# Apply a stable preparation on a branch targeting release/0.1.
npm run release -- 0.1.0 --channel stable --write

# Detect drift without changing files (exit status 1 on drift).
npm run release -- 0.1.0 --channel stable --check

# Independently prepare the next development version on main.
npm run release -- 0.2.0 --channel dev --write
```

Run with Node.js 24 or later. Preview lists planned files; `--write` is
repeatable; `--check` validates exactly the supplied version/channel. Invalid
arguments and malformed metadata fail before writing. Files are written
sequentially rather than transactionally: inspect the diff and rerun after an
interruption in a clean, isolated checkout.

The script does not select a branch, enforce increasing versions, build, test,
commit, tag, push, publish, create a GitHub release, or update marketplace
entries. Maintainers choose the branch/version and complete the manual gates.

## Preparation, publication, and promotion

1. Select a reviewed `main` commit and cut `release/0.1` for the initial stable
   release.
2. On a preparation branch targeting that maintenance line, write stable
   metadata, review the diff, rebuild bundles, update release-specific guidance
   and notes, and run the gates below.
3. Merge the preparation PR, rerun gates on the exact merged commit, then create
   the exact immutable tag and matching GitHub release. These are separate
   deliberate actions.
4. Promote the published tag through a separate `edgestream/agent-marketplace`
   PR. Stable entries use `recipes` and the immutable tag; development retains
   `recipes-dev` at `main`. Publishing a GitHub release does not promote it.
5. Verify fresh installation/update, displayed identity/version, MCP startup,
   and an actual tool call. `recipes-dev` and `recipes` are separate identities;
   do not assume settings migrate between them.

For a patch, fix on `main` first where practical, then cherry-pick only needed
commits into the maintenance line. Do not merge all of `main` or its development
metadata. Retries inspect existing tags/releases and never overwrite a published
object. Marketplace rollback is a separate PR; publish corrections as a new
patch version.

## Verification gates

Use a clean install and record Node/npm versions:

```bash
npm ci
npm run release -- 0.1.0 --channel stable --check
npm run build
npm run check
npm test
git diff --check
```

Commit regenerated bundles. The final candidate must be clean after build/tests,
have matching product/manifest/runtime versions, be on the intended maintenance
line, and have an absent or matching tag. Automated tests cover both channels,
patch preparation, preview/check, repeatability, pre-write lockfile failure, and
both bundled MCP transports reporting the root version. The ARM64 container smoke
check remains a separate required gate.

GitHub Actions required checks, a deliberately triggered publication workflow,
immutable-release configuration, and serialized publication/promotion are not
implemented by this tool. Marketplace and ChatGPT Directory publication remain
separate processes.
