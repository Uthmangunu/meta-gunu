import { describe, expect, it } from "vitest";
import { LiveClientEventSchema, LiveRelayStartSchema } from "../../../packages/protocol/src/index.js";
import { createLiveSessionStart, OPENAI_LIVE_SESSIONS_URL } from "../src/live-relay.js";

describe("Live relay policy", () => {
  it("requires explicit phone consent before a relay can start", () => {
    const common = {
      type: "meta_gunu.start",
      conversationId: crypto.randomUUID(),
    };
    expect(
      LiveRelayStartSchema.safeParse({
        ...common,
        audioSource: { kind: "phone", explicitConsent: false },
      }).success,
    ).toBe(false);
    expect(
      LiveRelayStartSchema.safeParse({
        ...common,
        audioSource: { kind: "phone", explicitConsent: true },
      }).success,
    ).toBe(true);
  });

  it("keeps session configuration server-owned", () => {
    expect(LiveClientEventSchema.safeParse({ type: "session.start", session: { model: "other" } }).success).toBe(false);
    expect(LiveClientEventSchema.safeParse({ type: "session.input_audio.append", audio: "AAE=" }).success).toBe(true);
    expect(createLiveSessionStart("live-test-model")).toMatchObject({
      type: "session.start",
      session: {
        model: "live-test-model",
        audio: { format: { type: "audio/pcm", rate: 24_000 } },
        store: false,
      },
    });
  });

  it("uses the documented primary Live WebSocket endpoint", () => {
    expect(OPENAI_LIVE_SESSIONS_URL).toBe("wss://api.openai.com/v1/live/sessions");
  });
});
