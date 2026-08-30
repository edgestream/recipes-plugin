import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

interface RootManifest {
  readonly bin?: Readonly<Record<string, string>>;
}

interface RootLockfile {
  readonly packages?: Readonly<Record<string, RootManifest>>;
}

const rootManifestUrl = new URL("../../../package.json", import.meta.url);
const rootLockfileUrl = new URL("../../../package-lock.json", import.meta.url);
const cliBundleUrl = new URL("../../../dist/recipes-cli.mjs", import.meta.url);
const cliManifestUrl = new URL("../package.json", import.meta.url);

test("exposes the committed CLI bundle as the workspace recipes executable", async () => {
  const manifest = JSON.parse(await readFile(rootManifestUrl, "utf8")) as RootManifest;
  const lockfile = JSON.parse(await readFile(rootLockfileUrl, "utf8")) as RootLockfile;
  const cliManifest = JSON.parse(await readFile(cliManifestUrl, "utf8")) as RootManifest;

  assert.equal(manifest.bin?.recipes, "./dist/recipes-cli.mjs");
  assert.equal(lockfile.packages?.[""]?.bin?.recipes, "dist/recipes-cli.mjs");
  assert.equal(cliManifest.bin, undefined);
  assert.match(await readFile(cliBundleUrl, "utf8"), /^#!\/usr\/bin\/env node\n/u);
  await access(cliBundleUrl, constants.X_OK);
});

test("runs the committed CLI bundle with an isolated personal data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recipes-cli-bundle-"));
  const source = join(directory, "source.json");
  await writeFile(source, JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Bundle Soup",
    description: "A bundled smoke-test soup.",
  }));
  const env = { ...process.env, RECIPES_DATA_DIRECTORY: join(directory, "data") };
  try {
    const imported = await execFileAsync(process.execPath, [fileURLToPath(cliBundleUrl), "import", source], { env });
    assert.equal(imported.stdout, "source\n");
    const searched = await execFileAsync(process.execPath, [fileURLToPath(cliBundleUrl), "search", "soup"], { env });
    assert.equal(searched.stdout, "recipes://personal/source: Bundle Soup\n");
    const deleted = await execFileAsync(process.execPath, [fileURLToPath(cliBundleUrl), "delete", "source"], { env });
    assert.equal(deleted.stdout, "source\n");
    const listed = await execFileAsync(process.execPath, [fileURLToPath(cliBundleUrl), "list"], { env });
    assert.equal(listed.stdout, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
