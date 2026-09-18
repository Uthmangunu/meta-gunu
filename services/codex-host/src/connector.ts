import WebSocket from "ws";
import {
  ConnectorInboundSchema,
  type ConnectorOutbound,
  type TaskSubmit,
} from "../../../packages/protocol/src/index.js";
import { CodexAppServer } from "./app-server.js";

interface ActiveTask {
  task: TaskSubmit;
  threadId: string;
  turnId: string;
}

interface CompletedTask {
  type: "task.completed" | "task.failed";
  payload: ConnectorOutbound;
}

export interface ConnectorConfig {
  url: string;
  token: string;
  deviceId: string;
  model: string;
  workspace: string;
}

export class LaptopConnector {
  private socket?: WebSocket;
  private reconnectAttempt = 0;
  private stopped = false;
  private readonly active = new Map<string, ActiveTask>();
  private readonly completed = new Map<string, CompletedTask>();
  private readonly approvals = new Map<string, { taskId: string; originalId: string | number }>();
  private readonly scheduled = new Set<string>();
  private executionChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConnectorConfig,
    private readonly codex = new CodexAppServer(),
  ) {
    this.codex.onEvent((event) => {
      const task = [...this.active.values()][0];
      if (event.method === "item/agentMessage/delta" && task) {
        const params = event.params && typeof event.params === "object" ? (event.params as Record<string, unknown>) : {};
        if (typeof params.delta === "string" && params.delta.trim()) {
          this.send({ type: "task.progress", taskId: task.task.taskId, message: params.delta });
        }
      }
      if (event.id === undefined || !event.method.toLowerCase().includes("approval")) return;
      if (!task) {
        this.codex.respond(event.id, { decision: "decline" });
        return;
      }
      this.approvals.set(String(event.id), { taskId: task.task.taskId, originalId: event.id });
      this.send({
        type: "approval.requested",
        taskId: task.task.taskId,
        requestId: event.id,
        method: event.method,
        summary: summarizeApproval(event.params),
      });
    });
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.codex.stop();
  }

  private connect(): void {
    if (this.stopped) return;
    const url = new URL(this.config.url);
    url.searchParams.set("deviceId", this.config.deviceId);
    const socket = new WebSocket(url, { headers: { authorization: `Bearer ${this.config.token}` } });
    this.socket = socket;
    socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.send({ type: "connector.ready", deviceId: this.config.deviceId, version: "0.1.0" });
    });
    socket.on("message", (data) => void this.receive(data.toString()));
    socket.on("error", (error) => console.error(`Connector socket error: ${error.message}`));
    socket.on("close", () => this.scheduleReconnect());
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt) + Math.floor(Math.random() * 250);
    this.reconnectAttempt += 1;
    setTimeout(() => this.connect(), delay);
  }

  private async receive(raw: string): Promise<void> {
    try {
      const message = ConnectorInboundSchema.parse(JSON.parse(raw));
      if (message.type === "task.submit") this.scheduleTask(message.task, message.codexThreadId);
      if (message.type === "task.cancel") {
        await this.codex.interrupt(message.codexThreadId, message.turnId);
      }
      if (message.type === "approval.resolve") {
        const approval = this.approvals.get(String(message.requestId));
        if (!approval) throw new Error("Unknown or expired approval request");
        this.codex.respond(approval.originalId, { decision: message.decision });
        this.approvals.delete(String(message.requestId));
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  private scheduleTask(task: TaskSubmit, codexThreadId?: string): void {
    if (this.scheduled.has(task.taskId) || this.active.has(task.taskId)) return;
    const prior = this.completed.get(task.taskId);
    if (prior) {
      this.send(prior.payload);
      return;
    }
    this.scheduled.add(task.taskId);
    this.executionChain = this.executionChain
      .then(() => this.runTask(task, codexThreadId))
      .catch((error) => console.error(error instanceof Error ? error.message : error));
  }

  private async runTask(task: TaskSubmit, codexThreadId?: string): Promise<void> {
    this.scheduled.delete(task.taskId);
    try {
      const run = await this.codex.run(task.prompt, {
        model: this.config.model,
        cwd: task.workspace ?? this.config.workspace,
        ...(codexThreadId ? { threadId: codexThreadId } : {}),
      });
      this.active.set(task.taskId, { task, threadId: run.threadId, turnId: run.turnId });
      this.send({ type: "task.started", taskId: task.taskId, codexThreadId: run.threadId, turnId: run.turnId });
      const finalResponse = await run.completed;
      const payload: ConnectorOutbound = { type: "task.completed", taskId: task.taskId, finalResponse };
      this.completed.set(task.taskId, { type: "task.completed", payload });
      this.send(payload);
    } catch (error) {
      const payload: ConnectorOutbound = {
        type: "task.failed",
        taskId: task.taskId,
        error: error instanceof Error ? error.message : "Unknown Codex error",
      };
      this.completed.set(task.taskId, { type: "task.failed", payload });
      this.send(payload);
    } finally {
      this.active.delete(task.taskId);
    }
  }

  private send(message: ConnectorOutbound): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

function summarizeApproval(params: unknown): string {
  const serialized = JSON.stringify(params);
  return serialized.length > 500 ? `${serialized.slice(0, 497)}...` : serialized;
}
