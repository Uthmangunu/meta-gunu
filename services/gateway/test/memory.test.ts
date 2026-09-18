import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/memory-store.js";

describe("memory controls", () => {
  it("does not retrieve a forgotten memory", async () => {
    const store = new InMemoryStore();
    const memory = await store.createMemory("user", { fact: "Prefers quiet hotels" });
    expect(await store.listMemories("user")).toHaveLength(1);
    expect(await store.deleteMemory("user", memory.id)).toBe(true);
    expect(await store.listMemories("user")).toHaveLength(0);
  });
});
