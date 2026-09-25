# Recipes in ChatGPT

This guide describes the verified development connection to the hosted Recipes
MCP service. It is not a directory listing or a published-plugin installation
guide: no Directory publication has been completed.

## Choose the right surface

ChatGPT and Codex are separate products. The root `plugin.json` and `mcp.json`
describe a portable plugin package; `.codex-plugin/plugin.json` and `.mcp.json`
are for Codex. Neither local package is a verified ChatGPT installation path.
The bundled stdio server is for Codex and trusted local use, not a server that
ChatGPT connects to directly.

Use the hosted connection in ChatGPT on the web. It is a Developer Mode MCP app,
not a published Directory app. ChatGPT connects to its remote Streamable HTTP
endpoint:

```text
https://recipes.dev.edgestream.cloud/mcp
```

The current OpenAI workflow and availability requirements are documented in
[Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
Availability and labels depend on the ChatGPT plan, workspace policy, role, and
rollout. Do not substitute an older Plugins or desktop menu path for the controls
shown by the current ChatGPT web UI.

## Connect the development app

1. Obtain permission to use Developer Mode in the intended ChatGPT workspace.
   Workspace admins enable it; Enterprise and Edu workspaces can grant access by
   role. The current UI can create an app from **Settings → Apps → Create** or
   **Workspace settings → Apps → Create**.
2. Create the custom MCP app with the endpoint above. Select OAuth when ChatGPT
   asks for authentication, then select **Scan Tools** and complete the browser
   authorization before creating the draft connection.
3. In the authorization browser flow, sign in to the intended Edgestream account
   and grant the requested Recipes access. Return to ChatGPT and wait for tool
   scanning to finish. A successful draft appears under the enabled apps with a
   `Dev` label.
4. Start a new ChatGPT conversation, select the development app for the message,
   and ask it to list your saved recipes.

The verified connection uses OAuth and the linked Edgestream identity selects the
hosted personal collection. It is separate from a ChatGPT account and from any
local `RECIPES_DATA_DIRECTORY` collection.

### Switch accounts deliberately

An existing Edgestream browser session can legitimately complete OAuth without a
password prompt. That is not evidence that the desired account was selected. To
change accounts reliably, disconnect the development app if the UI offers that
control, then use a separate browser profile or clear `edgestream.cloud` cookies
before reconnecting. Sign in to the intended account, complete authorization,
start a new ChatGPT conversation, and run `list_recipes` again. Verify the
expected personal recipe count or a known personal recipe before doing imports or
deletions. The two-account pilot found that choosing a shared-profile session was
the cause of a misleading collection result.

Disconnecting a ChatGPT connection revokes or removes access to the service; it
does not itself delete hosted recipes. No backup or restore workflow has been
qualified or documented for users.

## Verify the connection

The deployed MCP surface has these tools:

- `list_recipes` browses the linked personal collection with pagination. Ask
  “Show my saved recipes”, then “show the next page”.
- `search_recipes` searches configured providers with non-empty terms and returns
  provider-qualified results. It does not import a result. Ask “Search recipes
  for tomato pasta”.
- `get_recipe` retrieves the complete recipe by provider and provider-local ID.
  Ask “Show the details for that recipe”.
- `import_recipe` stores a chosen provider result in the personal collection.
  In hosted production, supply its `recipes://provider/id` reference; direct URL
  imports are not a normal production feature.
- `delete_recipe` permanently removes a personal recipe. Ask explicitly, for
  example, “Delete my saved recipe named …”, and confirm the destructive action.

Compatible clients can also read `recipes://personal` and individual
`recipes://{provider}/{id}` resources. They are MCP identifiers, not browser
links. `list_recipes` is the preferred way to browse an unfiltered collection.

For a safe first check, list the personal collection, search for a recipe, import
the returned provider reference, list again, and retrieve the imported recipe.
Use a disposable recipe if testing deletion. The tool names and resource surface
were checked against the bundled MCP server; see [MCP.md](MCP.md) for protocol and
pagination details.

## Storage and updates

Hosted recipes are stored in the account-scoped hosted collection. Local CLI and
stdio use `RECIPES_DATA_DIRECTORY`; packaged local plugins use host-managed
`${PLUGIN_DATA}`. Those local stores are independent of the hosted collection.
Do not edit a plugin cache or infer a durable path from it.

This guide covers the development connection only. Publishing an app to a
workspace directory is a separate administrator action and has not been
performed for Recipes. If a future app is published, the workspace administrator
must review and publish its scanned actions; ChatGPT does not automatically adopt
later MCP tool changes. Reconnect or refresh the app only through the controls
shown by ChatGPT, then begin a new conversation and repeat the verification.

## Troubleshooting

- **Developer Mode or Create is unavailable:** confirm the workspace plan, role,
  policy, and administrator enablement. ChatGPT availability varies by account
  and surface.
- **Tool scan or connection fails:** recheck the exact HTTPS `/mcp` endpoint and
  complete the OAuth browser flow. A local stdio command or `localhost` endpoint
  is not this hosted connection path.
- **The wrong recipes appear:** repeat the controlled account-switch procedure
  above and verify the collection before making changes.
- **A tool is missing or looks stale:** reconnect/refresh through the current
  ChatGPT controls and use a new conversation. Published workspace apps can have
  an administrator-reviewed tool snapshot.
- **Recipes seem absent after unlinking:** reconnect the same Edgestream account
  and list the collection. Unlinking does not delete hosted data; local and
  hosted collections are different stores.

For package-contract details, see [PLUGIN.md](PLUGIN.md). For the local CLI and
stdio workflow, see [CLI.md](CLI.md).
