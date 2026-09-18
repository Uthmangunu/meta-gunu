import { z } from "zod";

export const AudioSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("glasses"), routeId: z.string().min(1) }),
  z.object({ kind: z.literal("phone"), explicitConsent: z.literal(true) }),
]);
export type AudioSource = z.infer<typeof AudioSourceSchema>;

export const LiveSessionRequestSchema = z.object({
  sdp: z.string().min(1),
  audioSource: AudioSourceSchema,
  conversationId: z.string().uuid(),
});
export type LiveSessionRequest = z.infer<typeof LiveSessionRequestSchema>;

export const LiveRelayStartSchema = z.object({
  type: z.literal("meta_gunu.start"),
  conversationId: z.string().uuid(),
  audioSource: AudioSourceSchema,
});
export type LiveRelayStart = z.infer<typeof LiveRelayStartSchema>;

export const LiveClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.input_audio.append"), audio: z.string().min(1).max(1_000_000) }),
  z.object({ type: z.literal("session.close") }),
]);
export type LiveClientEvent = z.infer<typeof LiveClientEventSchema>;

export const ResearchRequestSchema = z.object({
  conversationId: z.string().uuid(),
  prompt: z.string().min(1).max(20_000),
  previousResponseId: z.string().min(1).optional(),
});
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

export const MemoryCreateSchema = z.object({
  fact: z.string().min(1).max(4_000),
  sourceConversationId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
});
export type MemoryCreate = z.infer<typeof MemoryCreateSchema>;

export const TaskKindSchema = z.enum(["research", "laptop"]);
export const TaskSubmitSchema = z.object({
  taskId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
  conversationId: z.string().uuid(),
  kind: TaskKindSchema,
  prompt: z.string().min(1).max(50_000),
  workspace: z.string().min(1).optional(),
});
export type TaskSubmit = z.infer<typeof TaskSubmitSchema>;

export const TaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled",
  "unavailable",
]);

export const ConnectorInboundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.submit"), task: TaskSubmitSchema, codexThreadId: z.string().optional() }),
  z.object({ type: z.literal("task.cancel"), taskId: z.string().uuid(), codexThreadId: z.string(), turnId: z.string() }),
  z.object({
    type: z.literal("approval.resolve"),
    requestId: z.union([z.string(), z.number()]),
    decision: z.enum(["accept", "acceptForSession", "decline", "cancel"]),
  }),
]);
export type ConnectorInbound = z.infer<typeof ConnectorInboundSchema>;

export const ConnectorOutboundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connector.ready"), deviceId: z.string(), version: z.string() }),
  z.object({ type: z.literal("task.started"), taskId: z.string().uuid(), codexThreadId: z.string(), turnId: z.string().optional() }),
  z.object({ type: z.literal("task.progress"), taskId: z.string().uuid(), message: z.string() }),
  z.object({ type: z.literal("task.completed"), taskId: z.string().uuid(), finalResponse: z.string() }),
  z.object({ type: z.literal("task.failed"), taskId: z.string().uuid(), error: z.string() }),
  z.object({
    type: z.literal("approval.requested"),
    taskId: z.string().uuid(),
    requestId: z.union([z.string(), z.number()]),
    method: z.string(),
    summary: z.string(),
  }),
]);
export type ConnectorOutbound = z.infer<typeof ConnectorOutboundSchema>;
