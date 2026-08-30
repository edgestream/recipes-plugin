import { readFile, writeFile } from "node:fs/promises";

const bundlePaths = process.argv.slice(2);

if (bundlePaths.length === 0) {
  throw new TypeError("At least one bundle path is required.");
}

for (const bundlePath of bundlePaths) {
  const source = await readFile(bundlePath, "utf8");
  const normalized = source.replace(/[\t ]+$/gmu, "");

  if (normalized !== source) {
    await writeFile(bundlePath, normalized, "utf8");
  }
}
