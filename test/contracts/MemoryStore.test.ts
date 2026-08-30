import { MemoryStore } from "../support/MemoryStore.js";
import { catalogContract } from "./catalogContract.js";

catalogContract("MemoryStore", async () => {
  const store = new MemoryStore();
  return { catalog: store, search: store, writer: store };
});
