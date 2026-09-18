import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../src/memory-store.js";

describe("task idempotency", () => {
  it("returns the first task for a repeated key", async () => {
    const store = new InMemoryStore();
    const first = {
      taskId: crypto.randomUUID(),
      idempotencyKey: "stable-retry-key",
      conversationId: crypto.randomUUID(),
      kind: "laptop" as const,
      prompt: "Inspect the repo",
    };
    const one = await store.createTask("user", first);
    const two = await store.createTask("user", { ...first, taskId: crypto.randomUUID() });
    expect(one.created).toBe(true);
    expect(two.created).toBe(false);
    expect(two.record.taskId).toBe(first.taskId);
  });

  it("deduplicates approval requests and resolves them once", async () => {
    const store = new InMemoryStore();
    const task = {
      taskId: crypto.randomUUID(),
      idempotencyKey: "approval-task-key",
      conversationId: crypto.randomUUID(),
      kind: "laptop" as const,
      prompt: "Update a file",
    };
    await store.createTask("user", task);
    const first = await store.createApproval(task.taskId, "7", "Allow file change");
    const duplicate = await store.createApproval(task.taskId, "7", "Allow file change");
    expect(duplicate.id).toBe(first.id);
    expect((await store.listApprovals("user"))).toHaveLength(1);
    expect((await store.resolveApproval("user", first.id, "declined"))?.status).toBe("declined");
    expect((await store.listApprovals("user"))).toHaveLength(0);
  });
});
