import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

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
