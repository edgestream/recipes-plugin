import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArguments, planRelease, prepareRelease } from "../scripts/release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async (directory, file) => JSON.parse(await readFile(join(directory, file), "utf8"));

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "recipes-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ["package.json", "package-lock.json", "plugin.json", ".codex-plugin", "apps", "packages"]) {
    await cp(join(root, file), join(directory, file), {
      recursive: true,
      filter: (source) => !source.split(/[\\/]/u).some((part) => ["dist", "node_modules"].includes(part)),
    });
  }
  await prepareRelease(directory, { version: "0.1.0", channel: "dev", mode: "write" });
  return directory;
}

test("committed versions and channel metadata agree", async () => {
  const { version } = await json(root, "package.json");
  const { name } = await json(root, "plugin.json");
  assert.ok(["recipes", "recipes-dev"].includes(name));
  assert.deepEqual(await planRelease(root, { version, channel: name === "recipes" ? "stable" : "dev" }), []);
});

test("release arguments reject ambiguous modes and invalid versions", () => {
  assert.deepEqual(parseArguments(["0.1.0", "--channel", "stable"]), { version: "0.1.0", channel: "stable", mode: "preview" });
  for (const args of [[], ["0.1.0"], ["0.1.0", "--channel", "other"], ["0.1.0", "--channel", "dev", "--write", "--check"], ["0.1.0", "--channel", "dev", "--unknown"], ...["v0.1.0", "0.2.0-dev.0", "01.0.0", "1.0", "1.0.0\n"].map((version) => [version, "--channel", "dev"])]) assert.throws(() => parseArguments(args), /Usage/);
});

test("preview is read-only; stable, patch and development preparation are repeatable", async (t) => {
  const directory = await fixture(t);
  const originalLock = await json(directory, "package-lock.json");
  const before = await readFile(join(directory, "plugin.json"), "utf8");
  const options = { version: "0.1.0", channel: "stable", mode: "preview" };
  assert.ok((await prepareRelease(directory, options)).some((change) => change.file === "plugin.json"));
  assert.equal(await readFile(join(directory, "plugin.json"), "utf8"), before);
  await assert.rejects(prepareRelease(directory, { ...options, mode: "check" }), /metadata differs/);
  for (const [version, channel] of [["0.1.0", "stable"], ["0.1.1", "stable"], ["0.2.0", "dev"]]) {
    const target = { version, channel, mode: "write" };
    await prepareRelease(directory, target);
    assert.deepEqual(await prepareRelease(directory, target), []);
    assert.deepEqual(await prepareRelease(directory, { ...target, mode: "check" }), []);
    const lock = await json(directory, "package-lock.json");
    assert.equal(lock.version, version);
    for (const [key, value] of Object.entries(lock.packages)) {
      if (key.split("/").includes("node_modules")) assert.deepEqual(value, originalLock.packages[key]);
      else {
        assert.equal(value.version, version);
        assert.equal((await json(directory, join(key, "package.json"))).version, version);
      }
    }
    const portable = await json(directory, "plugin.json");
    const codex = await json(directory, ".codex-plugin/plugin.json");
    assert.equal(portable.name, channel === "stable" ? "recipes" : "recipes-dev");
    assert.equal(codex.name, portable.name);
    const displayName = channel === "stable" ? "Recipes" : "Recipes Dev";
    assert.equal(portable.extensions["com.openai"].interface.displayName, displayName);
    assert.equal(codex.interface.displayName, displayName);
    assert.equal(portable.version, version);
    assert.equal(codex.version, version);
    assert.match(portable.$schema, /\/1\.0\.0\//);
    assert.ok((await readFile(join(directory, "apps/mcp-server/src/version.ts"), "utf8")).includes(`export const version = "${version}";`));
  }
});

test("invalid lockfile fails before any metadata is written", async (t) => {
  const directory = await fixture(t);
  const lock = await json(directory, "package-lock.json");
  delete lock.packages["apps/mcp-server"];
  await writeFile(join(directory, "package-lock.json"), JSON.stringify(lock));
  const before = await readFile(join(directory, "package.json"), "utf8");
  await assert.rejects(prepareRelease(directory, { version: "0.2.0", channel: "dev", mode: "write" }), /lockfile package/);
  assert.equal(await readFile(join(directory, "package.json"), "utf8"), before);
});
