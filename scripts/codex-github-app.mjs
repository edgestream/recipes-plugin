#!/usr/bin/env node
import { createPrivateKey, createSign } from "node:crypto";
import { readFile, mkdtemp, rm, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const API = "https://api.github.com";
const REQUIRED_REPOSITORY_PERMISSIONS = {
  contents: "write",
  issues: "write",
  pull_requests: "write"
};

const encode = (value) => Buffer.from(value).toString("base64url");

export function createAppJwt(appId, privateKey, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000) - 30;
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ iat: issuedAt, exp: issuedAt + 9 * 60, iss: String(appId) }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(createPrivateKey(privateKey)).toString("base64url")}`;
}

export function parseArguments(argv) {
  const separator = argv.indexOf("--");
  const options = argv.slice(0, separator === -1 ? undefined : separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);
  const result = { command: options[0], child: command, repo: undefined };
  for (let index = 1; index < options.length; index += 1) {
    if (options[index] === "--repo") result.repo = options[++index];
    else throw new Error(`Unknown option: ${options[index]}`);
  }
  return result;
}

async function api(path, token, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed (${response.status}).`);
  return body;
}

async function publicApi(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (!response.ok) throw new Error(`GitHub API GET ${path} failed (${response.status}).`);
  return response.json();
}

async function readPrivateKey(path) {
  const details = await stat(path);
  if (!details.isFile() || details.uid !== process.getuid() || (details.mode & 0o077) !== 0) {
    throw new Error("The private-key file must be a current-user-owned regular file with mode 0600.");
  }
  return readFile(path, "utf8");
}

function requireConfiguration(repo) {
  const appId = process.env.CODEX_GITHUB_APP_ID;
  const installationId = process.env.CODEX_GITHUB_APP_INSTALLATION_ID;
  const privateKeyPath = process.env.CODEX_GITHUB_APP_PRIVATE_KEY_FILE;
  if (!appId || !installationId || !privateKeyPath || !repo?.includes("/")) {
    throw new Error("Set CODEX_GITHUB_APP_ID, CODEX_GITHUB_APP_INSTALLATION_ID, CODEX_GITHUB_APP_PRIVATE_KEY_FILE and pass --repo OWNER/REPO.");
  }
  return { appId, installationId, privateKeyPath, repo };
}

export async function createInstallationSession(configuration) {
  const privateKey = await readPrivateKey(configuration.privateKeyPath);
  const appJwt = createAppJwt(configuration.appId, privateKey);
  const app = await api("/app", appJwt);
  if (String(app.id) !== String(configuration.appId)) throw new Error("The private key does not belong to CODEX_GITHUB_APP_ID.");
  const [, repository] = configuration.repo.split("/", 2);
  const tokenResponse = await api(`/app/installations/${configuration.installationId}/access_tokens`, appJwt, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [repository] })
  });
  const accessible = await api("/installation/repositories", tokenResponse.token);
  if (!accessible.repositories.some(({ full_name }) => full_name === configuration.repo)) {
    throw new Error(`The installation token cannot access ${configuration.repo}.`);
  }
  for (const [permission, expected] of Object.entries(REQUIRED_REPOSITORY_PERMISSIONS)) {
    if (tokenResponse.permissions[permission] !== expected) throw new Error(`The installation lacks ${permission}:${expected}.`);
  }
  const bot = await publicApi(`/users/${encodeURIComponent(`${app.slug}[bot]`)}`);
  return { app, bot, token: tokenResponse.token, expiresAt: tokenResponse.expires_at, permissions: tokenResponse.permissions };
}

async function runChild(child, session) {
  if (child.length === 0) throw new Error("exec requires a command after --.");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "codex-github-app-"));
  const askPass = join(temporaryDirectory, "askpass.sh");
  try {
    await writeFile(askPass, "#!/bin/sh\ncase \"$1\" in *Username*) printf '%s' x-access-token ;; *) printf '%s' \"$CODEX_GITHUB_INSTALLATION_TOKEN\" ;; esac\n", { mode: 0o700 });
    await chmod(askPass, 0o700);
    const email = `${session.bot.id}+${session.bot.login}@users.noreply.github.com`;
    const inheritedConfigCount = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10);
    const credentialConfigIndex = Number.isSafeInteger(inheritedConfigCount) && inheritedConfigCount >= 0 ? inheritedConfigCount : 0;
    const environment = {
      ...process.env,
      GH_TOKEN: session.token,
      CODEX_GITHUB_INSTALLATION_TOKEN: session.token,
      GIT_ASKPASS: askPass,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: session.bot.login,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: session.bot.login,
      GIT_COMMITTER_EMAIL: email,
      GIT_CONFIG_COUNT: String(credentialConfigIndex + 1),
      [`GIT_CONFIG_KEY_${credentialConfigIndex}`]: "credential.helper",
      [`GIT_CONFIG_VALUE_${credentialConfigIndex}`]: ""
    };
    const exitCode = await new Promise((resolve, reject) => {
      const process = spawn(child[0], child.slice(1), { stdio: "inherit", env: environment });
      process.on("error", reject);
      process.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exitCode = exitCode;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArguments(argv);
  if (!['preflight', 'exec'].includes(parsed.command)) throw new Error("Usage: codex-github-app <preflight|exec> --repo OWNER/REPO [-- COMMAND ...]");
  const session = await createInstallationSession(requireConfiguration(parsed.repo));
  if (parsed.command === 'preflight') {
    process.stdout.write(`${JSON.stringify({ app: session.app.slug, bot: session.bot.login, botId: session.bot.id, expiresAt: session.expiresAt, permissions: session.permissions })}\n`);
    return;
  }
  await runChild(parsed.child, session);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`codex-github-app: ${error.message}\n`);
    process.exitCode = 1;
  });
}
