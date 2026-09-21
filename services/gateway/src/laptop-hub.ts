import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ConnectorOutboundSchema, type ConnectorInbound, type TaskSubmit } from "../../../packages/protocol/src/index.js";
import type { Store } from "./store.js";

export class LaptopHub {
  private readonly server = new WebSocketServer({ noServer: true });
  private socket: WebSocket | undefined;

  constructor(
    private readonly token: string,
    private readonly store: Store,
  ) {
    this.server.on("connection", (socket) => {
      this.socket?.close(4001, "Replaced by a newer connector");
      this.socket = socket;
      socket.on("message", (data) => {
        void this.handleMessage(data.toString()).catch((error) =>
          console.error(error instanceof Error ? error.message : "Invalid laptop connector message"),
        );
      });
      socket.on("close", () => {
        if (this.socket === socket) this.socket = undefined;
      });
    });
  }

  upgrade(request: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): boolean {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/laptop/connect") return false;
    if (request.headers.authorization !== `Bearer ${this.token}`) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return true;
    }
    this.server.handleUpgrade(request, socket, head, (ws) => this.server.emit("connection", ws, request));
    return true;
  }

  get connected(): boolean {
    return this.socket?.readyState === this.socket?.OPEN;
  }

  submit(task: TaskSubmit, codexThreadId?: string): boolean {
    return this.send({ type: "task.submit", task, ...(codexThreadId ? { codexThreadId } : {}) });
  }

  cancel(taskId: string, codexThreadId: string, turnId: string): boolean {
    return this.send({ type: "task.cancel", taskId, codexThreadId, turnId });
  }

  resolveApproval(requestId: string | number, decision: "accept" | "acceptForSession" | "decline" | "cancel"): boolean {
    return this.send({ type: "approval.resolve", requestId, decision });
  }

  private send(message: ConnectorInbound): boolean {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private async handleMessage(raw: string): Promise<void> {
    const parsedJson: unknown = JSON.parse(raw);
    const message = ConnectorOutboundSchema.parse(parsedJson);
    if (message.type === "task.started") {
      await this.store.updateTask(message.taskId, {
        status: "running",
        codexThreadId: message.codexThreadId,
        ...(message.turnId ? { codexTurnId: message.turnId } : {}),
      });
    } else if (message.type === "task.completed") {
      await this.store.updateTask(message.taskId, { status: "completed", result: message.finalResponse });
    } else if (message.type === "task.failed") {
      await this.store.updateTask(message.taskId, { status: "failed", error: message.error });
    } else if (message.type === "approval.requested") {
      await this.store.createApproval(message.taskId, String(message.requestId), message.summary);
      await this.store.updateTask(message.taskId, { status: "waiting_for_approval" });
    }
  }
}
