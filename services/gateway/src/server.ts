import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { z } from "zod";
import {
  LiveSessionRequestSchema,
  MemoryCreateSchema,
  ResearchRequestSchema,
  TaskSubmitSchema,
} from "../../../packages/protocol/src/index.js";
import { BudgetGuard } from "./budget.js";
import type { GatewayConfig } from "./config.js";
import { LaptopHub } from "./laptop-hub.js";
import { LiveRelay } from "./live-relay.js";
import { OpenAIProvider, UnconfiguredAIProvider, type AIProvider } from "./openai-provider.js";
import { PostgresStore, type Store } from "./store.js";

const userId = "00000000-0000-4000-8000-000000000001";

export interface GatewayDependencies {
  store: Store;
  ai: AIProvider;
  budget: BudgetGuard;
  laptop: LaptopHub;
  live: LiveRelay;
}

export function productionDependencies(config: GatewayConfig): { dependencies: GatewayDependencies; pool: Pool } {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const store = new PostgresStore(pool);
  const ai = config.openAIKey
    ? new OpenAIProvider(config.openAIKey, config.liveModel, config.reasoningModel)
    : new UnconfiguredAIProvider();
  const budget = new BudgetGuard(config.monthlySpendLimitUsd, config.spendWarningRatio);
  return {
    pool,
    dependencies: {
      store,
      ai,
      budget,
      laptop: new LaptopHub(config.laptopConnectorToken, store),
      live: new LiveRelay({
        apiToken: config.apiToken,
        ...(config.openAIKey ? { openAIKey: config.openAIKey } : {}),
        liveModel: config.liveModel,
        store,
        budget,
      }),
    },
  };
}

export function createGatewayServer(config: GatewayConfig, dependencies: GatewayDependencies) {
  const server = createServer(async (request, response) => {
    try {
      await route(config, dependencies, request, response);
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error instanceof UnauthorizedError ? 401 : 500;
      respond(response, status, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    if (dependencies.live.upgrade(request, socket, head)) return;
    if (!dependencies.laptop.upgrade(request, socket, head)) socket.destroy();
  });
  return server;
}

async function route(
  config: GatewayConfig,
  dependencies: GatewayDependencies,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method === "GET" && url.pathname === "/healthz") return respond(response, 200, { ok: true });
  authenticate(config, request);

  if (method === "GET" && url.pathname === "/v1/budget") {
    const spent = await dependencies.store.monthlySpendUsd(userId);
    return respond(response, 200, dependencies.budget.evaluate(spent));
  }

  if (method === "POST" && url.pathname === "/v1/live/sessions") {
    const body = LiveSessionRequestSchema.parse(await readJson(request));
    const spent = await dependencies.store.monthlySpendUsd(userId);
    const budget = dependencies.budget.assertCanStart(spent);
    const session = await dependencies.ai.createLiveSession(body.sdp);
    return respond(response, 201, { session, budget, acceptedAudioSource: body.audioSource });
  }

  if (method === "POST" && url.pathname === "/v1/research") {
    const body = ResearchRequestSchema.parse(await readJson(request));
    const spent = await dependencies.store.monthlySpendUsd(userId);
    const budget = dependencies.budget.assertCanStart(spent);
    const result = await dependencies.ai.research(body.prompt, body.previousResponseId);
    return respond(response, 200, { ...result, budget });
  }

  if (url.pathname === "/v1/memories" && method === "GET") {
    return respond(response, 200, { memories: await dependencies.store.listMemories(userId) });
  }
  if (url.pathname === "/v1/memories" && method === "POST") {
    const memory = MemoryCreateSchema.parse(await readJson(request));
    return respond(response, 201, await dependencies.store.createMemory(userId, memory));
  }

  const memoryId = matchId(url.pathname, "/v1/memories/");
  if (memoryId && method === "PATCH") {
    const body = z.object({ fact: z.string().min(1).max(4_000) }).parse(await readJson(request));
    const memory = await dependencies.store.updateMemory(userId, memoryId, body.fact);
    return memory ? respond(response, 200, memory) : respond(response, 404, { error: "Memory not found" });
  }
  if (memoryId && method === "DELETE") {
    const deleted = await dependencies.store.deleteMemory(userId, memoryId);
    return respond(response, deleted ? 204 : 404, deleted ? undefined : { error: "Memory not found" });
  }

  if (url.pathname === "/v1/tasks" && method === "POST") {
    const task = TaskSubmitSchema.parse(await readJson(request));
    const stored = await dependencies.store.createTask(userId, task);
    if (stored.created && task.kind === "laptop") {
      const sent = dependencies.laptop.submit(task, stored.record.codexThreadId);
      if (!sent) await dependencies.store.updateTask(task.taskId, { status: "unavailable", error: "Laptop is offline" });
    }
    if (stored.created && task.kind === "research") {
      void runResearchTask(dependencies, userId, task.taskId, task.prompt);
    }
    const record = await dependencies.store.getTask(userId, stored.record.taskId);
    return respond(response, stored.created ? 202 : 200, { task: record, deduplicated: !stored.created });
  }

  const taskId = matchId(url.pathname, "/v1/tasks/");
  if (taskId && method === "GET") {
    const task = await dependencies.store.getTask(userId, taskId);
    return task ? respond(response, 200, task) : respond(response, 404, { error: "Task not found" });
  }
  if (taskId && method === "DELETE") {
    const task = await dependencies.store.getTask(userId, taskId);
    if (!task) return respond(response, 404, { error: "Task not found" });
    if (task.codexThreadId && task.codexTurnId) dependencies.laptop.cancel(task.taskId, task.codexThreadId, task.codexTurnId);
    await dependencies.store.updateTask(task.taskId, { status: "cancelled" });
    return respond(response, 204);
  }

  if (url.pathname === "/v1/approvals" && method === "GET") {
    return respond(response, 200, { approvals: await dependencies.store.listApprovals(userId) });
  }

  const approvalId = matchId(url.pathname, "/v1/approvals/");
  if (approvalId && method === "POST") {
    const body = z
      .object({ decision: z.enum(["accept", "acceptForSession", "decline", "cancel"]) })
      .parse(await readJson(request));
    const pending = (await dependencies.store.listApprovals(userId)).find((approval) => approval.id === approvalId);
    if (!pending) return respond(response, 404, { error: "Pending approval not found" });
    if (!dependencies.laptop.resolveApproval(pending.providerRequestId, body.decision)) {
      return respond(response, 409, { error: "Laptop is offline; approval remains pending" });
    }
    const status = body.decision === "accept" || body.decision === "acceptForSession" ? "accepted" : body.decision === "decline" ? "declined" : "cancelled";
    const resolved = await dependencies.store.resolveApproval(userId, approvalId, status);
    return respond(response, 200, resolved);
  }

  respond(response, 404, { error: "Not found" });
}

async function runResearchTask(
  dependencies: GatewayDependencies,
  ownerId: string,
  taskId: string,
  prompt: string,
): Promise<void> {
  try {
    const spent = await dependencies.store.monthlySpendUsd(ownerId);
    dependencies.budget.assertCanStart(spent);
    await dependencies.store.updateTask(taskId, { status: "running" });
    const result = await dependencies.ai.research(prompt);
    const current = await dependencies.store.getTask(ownerId, taskId);
    if (current?.status !== "cancelled") {
      await dependencies.store.updateTask(taskId, { status: "completed", result: JSON.stringify(result) });
    }
  } catch (error) {
    const current = await dependencies.store.getTask(ownerId, taskId);
    if (current?.status !== "cancelled") {
      await dependencies.store.updateTask(taskId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Research failed",
      });
    }
  }
}

function authenticate(config: GatewayConfig, request: IncomingMessage): void {
  if (request.headers.authorization !== `Bearer ${config.apiToken}`) throw new UnauthorizedError();
}

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > 1_000_000) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function matchId(pathname: string, prefix: string): string | undefined {
  if (!pathname.startsWith(prefix)) return undefined;
  const id = pathname.slice(prefix.length);
  return z.string().uuid().safeParse(id).success ? id : undefined;
}

function respond(response: ServerResponse, status: number, value?: unknown): void {
  response.statusCode = status;
  if (value === undefined) {
    response.end();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}
