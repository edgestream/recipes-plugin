# Recipes internal operation

This guide covers the closed Edgestream reference service. It is for the
workspace administrator and the two intended participants; it is not a public
installation or Directory guide.

## Current state

The hosted reference service and its OAuth connection have been verified at:

```text
https://recipes.dev.edgestream.cloud/mcp
```

Each authorized OAuth subject receives a separate hosted collection. The
reference deployment does **not** yet establish workspace preinstallation,
assignment, or an admission policy for the closed group. Those changes and their
verification belong to [#34](https://github.com/edgestream/recipes-plugin/issues/34).
Do not infer access approval from the endpoint being reachable or from a
marketplace package being installable.

## Responsibilities

The workspace administrator manages the app once #34 supplies the verified
workspace provisioning path: app availability, assignment, action review, and
tool refresh. Until then, do not claim that Recipes is preinstalled or that a
workspace setting limits hosted access.

Each participant links their own Edgestream account through OAuth. The linked
account selects the hosted collection; it is independent of the ChatGPT account
and of a local Codex or CLI collection. Participants do not need infrastructure
credentials or deployment access.

The infrastructure operator selects the deployed image through GitOps and
investigates service or authorization failures. Use the [OAuth integration
contract](https://github.com/edgestream/infrastructure/blob/main/docs/RECIPES_OAUTH_INTEGRATION.md)
for the deployed identity boundary and the [Argo CD runbook](https://github.com/edgestream/infrastructure/blob/main/k8s/argocd/README.md)
for deployment inspection and rollback. Release preparation, publication, and
marketplace promotion are separate stages in [RELEASE.md](RELEASE.md) and
[PLUGIN.md](PLUGIN.md).

## Participant connection and check

In a new ChatGPT conversation, select the internal Recipes app when it is
available, complete OAuth, and choose the intended Edgestream account. Existing
browser sessions can complete the flow without asking for a password.

Run a short check:

1. Ask to list saved recipes and confirm the expected empty state, count, or a
   known personal recipe.
2. Optionally search for a recipe, retrieve the selected result, and import its
   provider-qualified reference into the personal collection.
3. If deletion is tested, use only a disposable personal recipe.

Hosted production imports use provider-qualified `recipes://` references. Direct
URL imports are disabled except for the explicit non-production test gate.

### Change accounts

Do not treat the absence of a password prompt as account confirmation. To link a
different account, use a separate browser profile or clear `edgestream.cloud`
cookies before reconnecting. Complete OAuth for the intended account, start a
new conversation, then list the collection before importing or deleting. The
completed two-account pilot found that a shared browser session, not collection
ownership, caused the earlier wrong-account result.

## Connection and data lifecycle

These actions are separate:

| Action | Effect | Does not do |
| --- | --- | --- |
| Disconnect the app in ChatGPT | Removes the client connection. | It is not evidence that the server-side OAuth grant was revoked or that recipes were deleted. |
| Revoke the OAuth grant | Stops future authorization under that grant. Ask the identity/infrastructure owner to perform and verify it. | It does not delete recipes. |
| Log out of the browser | Ends or changes the browser session used for the next OAuth flow. | It does not revoke a grant or delete recipes. |
| Delete a recipe | Permanently removes that personal recipe. | It does not disconnect the app, revoke a grant, or delete the account collection. |

Hosted collections are account-scoped. Local CLI and Codex stores use their own
data directory or `${PLUGIN_DATA}` and are separate from hosted data. Backup and
restore remain deferred; this guide makes no recovery guarantee. For the separate
Codex package path, use the [marketplace installation guide](https://github.com/edgestream/agent-marketplace#installation).

## Diagnose a problem

- **Connection or authorization fails:** retry OAuth from a new chat. A `401`
  indicates missing, expired, or invalid authorization; reconnect first. Escalate
  repeated failures with the time and observed status to the infrastructure
  operator.
- **A `403` or unavailable operation:** the account may lack the required scope
  or the workspace app may require an administrator review. Ask the workspace
  administrator to check the app/action configuration; ask infrastructure to
  investigate verified-token failures.
- **The wrong collection appears:** follow the controlled account-switch steps,
  then list the collection again before making changes.
- **Tools are stale after an update:** start a new conversation. The workspace
  administrator refreshes and reviews changed actions where the ChatGPT UI
  requires it; the infrastructure operator confirms the GitOps image and
  application health.
- **A collection seems missing after disconnecting:** reconnect the same
  Edgestream account and list it. Disconnection, browser logout, and grant
  revocation do not delete recipe data.

For MCP tools, paging, scopes, and error semantics, see [MCP.md](MCP.md). The
current ChatGPT controls and availability are described by OpenAI's [Developer
mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
