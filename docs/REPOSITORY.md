# Source Code Repository
Git conventions for this repository

## Commit messages

Use short, single-line commit messages in the following format:

```text
<type>: <short description in the imperative>
```

Do not use scopes. Write the description in English without a trailing period.
Start the description with a lowercase letter; retain capitalization for proper
names and acronyms.

### Types

| Type | Usage |
| --- | --- |
| `feat` | New functionality or automation |
| `fix` | Bug fixes |
| `docs` | Documentation |
| `refactor` | Restructuring without changing functionality |
| `test` | Adding or updating tests |
| `chore` | Maintenance, configuration, or other tasks |

### Examples

```text
docs: describe the home office infrastructure
feat: automate backup checks
fix: correct the network drive path
chore: prepare the repository structure
```

For changes that need additional context, a detailed commit body may follow
after a blank line. It should primarily explain why the change was made.
