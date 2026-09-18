import { describe, expect, it } from "vitest";
import { AudioSourceSchema, TaskSubmitSchema } from "../src/index.js";

describe("wire protocol", () => {
  it("requires explicit consent for phone audio", () => {
    expect(AudioSourceSchema.safeParse({ kind: "phone" }).success).toBe(false);
    expect(AudioSourceSchema.safeParse({ kind: "phone", explicitConsent: true }).success).toBe(true);
  });

  it("requires stable task and idempotency identifiers", () => {
    expect(
      TaskSubmitSchema.safeParse({
        taskId: crypto.randomUUID(),
        idempotencyKey: "retry-key-0001",
        conversationId: crypto.randomUUID(),
        kind: "laptop",
        prompt: "Inspect the project",
      }).success,
    ).toBe(true);
  });
});
