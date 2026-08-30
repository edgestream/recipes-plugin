import assert from "node:assert/strict";
import test from "node:test";
import { localRecipesConfiguration } from "../src/index.js";

test("reads local runtime configuration once for both frontends", () => {
  assert.deepEqual(localRecipesConfiguration({
    RECIPES_DATA_DIRECTORY: "/tmp/recipes-runtime-test",
    RECIPES_PROVIDER: "family",
  }), {
    dataDirectory: "/tmp/recipes-runtime-test",
    provider: "family",
  });
});
