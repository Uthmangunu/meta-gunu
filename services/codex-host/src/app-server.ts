import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

interface JsonRpcResponse {
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcRequest {
  id?: string | number;
  method: string;
  params?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface CodexRun {
  threadId: string;
  turnId: string;
  completed: Promise<string>;
}

export type CodexEventHandler = (event: JsonRpcRequest) => void;

export class CodexAppServer {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingRequest>();
  private readonly eventHandlers = new Set<CodexEventHandler>();
  private initialized = false;

  constructor(private readonly command = "codex") {}

  async start(): Promise<void> {
    if (this.process) return;
    const child = spawn(this.command, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    this.process = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.receive(line));
    child.stderr.on("data", (chunk) => process.stderr.write(`[codex] ${chunk.toString()}`));
    child.on("exit", (code) => {
      const error = new Error(`codex app-server exited with code ${code ?? "unknown"}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.process = undefined;
      this.initialized = false;
    });

    await this.request("initialize", {
      clientInfo: { name: "meta_gunu", title: "Meta Gunu", version: "0.1.0" },
      capabilities: { experimentalApi: false },
    });
    this.notify("initialized", {});
    this.initialized = true;
  }

  onEvent(handler: CodexEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async run(prompt: string, options: { model: string; cwd: string; threadId?: string }): Promise<CodexRun> {
    await this.start();
    if (!this.initialized) throw new Error("Codex app-server did not initialize");

    const threadResult = options.threadId
      ? await this.request("thread/resume", { threadId: options.threadId })
      : await this.request("thread/start", {
          model: options.model,
          cwd: options.cwd,
          sandbox: "workspaceWrite",
          approvalPolicy: "on-request",
          serviceName: "meta-gunu",
        });
    const threadId = readNestedString(threadResult, "thread", "id");

    const turnResult = await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }],
    });
    const turnId = readNestedString(turnResult, "turn", "id");
    const completed = this.waitForTurn(threadId, turnId);
    return { threadId, turnId, completed };
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.request("turn/interrupt", { threadId, turnId });
  }

  respond(id: string | number, result: unknown): void {
    this.write({ id, result });
  }

  stop(): void {
    this.process?.kill("SIGTERM");
    this.process = undefined;
    this.initialized = false;
  }

  private waitForTurn(threadId: string, turnId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let finalResponse = "";
      const unsubscribe = this.onEvent((event) => {
        const params = asRecord(event.params);
        const eventThreadId = readOptionalNestedString(params, "thread", "id") ?? optionalString(params.threadId);
        const eventTurnId = readOptionalNestedString(params, "turn", "id") ?? optionalString(params.turnId);
        if (eventThreadId && eventThreadId !== threadId) return;
        if (eventTurnId && eventTurnId !== turnId) return;
        if (event.method === "item/agentMessage/delta") {
          finalResponse += optionalString(params.delta) ?? "";
        }
        if (event.method === "turn/completed") {
          unsubscribe();
          resolve(finalResponse.trim());
        }
        if (event.method === "turn/failed") {
          unsubscribe();
          reject(new Error(optionalString(params.error) ?? "Codex turn failed"));
        }
      });
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.write({ id, method, params });
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  private notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  private write(message: unknown): void {
    if (!this.process) throw new Error("Codex app-server is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: JsonRpcResponse | JsonRpcRequest;
    try {
      message = JSON.parse(line) as JsonRpcResponse | JsonRpcRequest;
    } catch {
      return;
    }
    if ("id" in message && message.id !== undefined && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if ("method" in message) for (const handler of this.eventHandlers) handler(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNestedString(value: unknown, parent: string, child: string): string {
  const result = readOptionalNestedString(asRecord(value), parent, child);
  if (!result) throw new Error(`Codex response missing ${parent}.${child}`);
  return result;
}

function readOptionalNestedString(value: Record<string, unknown>, parent: string, child: string): string | undefined {
  return optionalString(asRecord(value[parent])[child]);
}
