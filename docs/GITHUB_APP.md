# Codex GitHub App identity

Codex GitHub mutations use a dedicated GitHub App installation token. The normal
human `gh` login and normal Git identity must remain unchanged.

## GPT1 configuration

The GitHub App private key belongs only in a current-user-owned `0600` file
outside every repository. On GPT1 its approved local location is:

```text
~/.local/share/codex-github-app/github-app.pem
```

Set the following values only for the invocation that needs them. The app ID and
installation ID are identifiers, not secrets; the PEM path must never be printed
or committed.

```bash
export CODEX_GITHUB_APP_ID=4803359
export CODEX_GITHUB_APP_INSTALLATION_ID=158453912
export CODEX_GITHUB_APP_PRIVATE_KEY_FILE="$HOME/.local/share/codex-github-app/github-app.pem"
```

GPT1 additionally installs a current-user-only `~/.local/bin/gh` wrapper ahead
of `/usr/bin/gh`. It supplies that configuration and invokes this launcher for
every `gh` command. The wrapper infers `OWNER/REPO` from the current Git remote;
outside a repository callers must pass `--repo OWNER/REPO`. Missing or ambiguous
repository context fails closed. Do not call `/usr/bin/gh` directly from GPT1.

GPT1 also installs a current-user-only `~/.local/bin/git` wrapper. It supplies
the bot author and committer identity process-locally for every Git command. For
GitHub `clone`, `fetch`, `pull`, `push`, and `ls-remote`, it derives the target
from the URL or `origin` and routes the operation through the App launcher.
An installation without access to that repository fails rather than using a
personal HTTPS credential. Do not call `/usr/bin/git` directly from GPT1.

Preflight a repository before mutations:

```bash
node /home/marioschmidt/projects/recipes-plugin/scripts/codex-github-app.mjs \
  preflight --repo edgestream/recipes-plugin
```

Run exactly one GitHub or Git operation as the app:

```bash
node /home/marioschmidt/projects/recipes-plugin/scripts/codex-github-app.mjs \
  exec --repo edgestream/recipes-plugin -- gh issue list
```

The launcher mints a repository-restricted installation token, passes it only to
the child process, uses a temporary `GIT_ASKPASS` program for HTTPS Git, and sets
the bot as Git author and committer. It never changes `gh auth`, the remote URL,
or persistent Git configuration. Each invocation mints a new token; retry a
failed operation through the launcher rather than falling back to the human token.

## Required permissions

The current organisation-wide installation grants `Contents`, `Issues`, and
`Pull requests` read/write and `Issue fields` read. Do not add Administration,
branch-protection bypass, or `Workflows` permission unless a specific task
requires workflow-file changes.

## Verification and recovery

Use `preflight` before the first mutation for a repository. It validates the
private-key mode and ownership, App ID, installation, repository allowlist,
required permissions, and bot identity without printing credentials.

After creating a pull request, verify the bot actor, commit author and committer,
and requested human reviewer in GitHub. If preflight fails, stop: do not retry
the operation using the personal `gh` session. To revoke access, uninstall the
App installation; to rotate a compromised PEM, generate a replacement key, test
preflight, then revoke the old key in the App settings.
