import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { LiveClientEventSchema, LiveRelayStartSchema } from "../../../packages/protocol/src/index.js";
import type { BudgetGuard } from "./budget.js";
import type { Store } from "./store.js";

const ownerId = "00000000-0000-4000-8000-000000000001";

export interface LiveRelayOptions {
  apiToken: string;
  openAIKey?: string;
  liveModel: string;
  store: Store;
  budget: BudgetGuard;
  upstreamURL?: string;
}

/**
 * Authenticated, policy-filtered relay between an iPhone and OpenAI Live.
 * The provider credential never reaches the phone. The phone may append audio
 * or close a session, but it cannot replace server-owned model instructions.
 */
export class LiveRelay {
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 1_500_000 });

  constructor(private readonly options: LiveRelayOptions) {
    this.server.on("connection", (client) => {
      void this.acceptClient(client);
    });
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/live/connect") return false;
    if (request.headers.authorization !== `Bearer ${this.options.apiToken}`) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return true;
    }
    this.server.handleUpgrade(request, socket, head, (ws) => this.server.emit("connection", ws, request));
    return true;
  }

  private async acceptClient(client: WebSocket): Promise<void> {
    let upstream: WebSocket | undefined;
    let started = false;

    const closeBoth = (code = 1000, reason = "Session closed"): void => {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) {
        upstream.close(code, reason);
      }
    };

    const fail = (message: string, code = 4000): void => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "meta_gunu.error", message }));
      }
      closeBoth(code, message.slice(0, 120));
    };

    client.once("message", async (raw) => {
      try {
        LiveRelayStartSchema.parse(parseJSON(raw));
        const spent = await this.options.store.monthlySpendUsd(ownerId);
        const budget = this.options.budget.assertCanStart(spent);
        if (!this.options.openAIKey) return fail("OPENAI_API_KEY is not configured", 4003);
        if (client.readyState !== WebSocket.OPEN) return;

        upstream = new WebSocket(this.options.upstreamURL ?? "wss://api.openai.com/v1/live", {
          headers: { authorization: `Bearer ${this.options.openAIKey}` },
        });

        upstream.once("open", () => {
          upstream?.send(JSON.stringify(createLiveSessionStart(this.options.liveModel)));
        });
        upstream.on("message", (message) => {
          if (client.readyState !== WebSocket.OPEN) return;
          const text = message.toString();
          try {
            const event = JSON.parse(text) as { type?: unknown };
            if (event.type === "session.started") {
              started = true;
              client.send(JSON.stringify({ type: "meta_gunu.ready", budget }));
            }
          } catch {
            // Forward unknown provider payloads; the native client handles invalid events fail-closed.
          }
          client.send(text);
        });
        upstream.on("error", () => fail("Live provider connection failed", 4502));
        upstream.on("close", (code, reason) => {
          if (client.readyState === WebSocket.OPEN) client.close(code || 1000, reason.toString().slice(0, 120));
        });
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid session start", 4002);
      }
    });

    client.on("message", (raw) => {
      if (!started || !upstream || upstream.readyState !== WebSocket.OPEN) return;
      try {
        const event = LiveClientEventSchema.parse(parseJSON(raw));
        upstream.send(JSON.stringify(event));
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid live event", 4002);
      }
    });
    client.on("close", () => closeBoth());
    client.on("error", () => closeBoth(1011, "Client connection failed"));
  }
}

function parseJSON(raw: RawData): unknown {
  return JSON.parse(raw.toString());
}

export function createLiveSessionStart(model: string) {
  return {
    type: "session.start" as const,
    session: {
      model,
      instructions:
        "You are Musa, the Meta Gunu companion. Converse naturally and concisely. If the user says end session, acknowledge briefly so the app can close the session. Never claim an external action succeeded unless a tool result confirms it.",
      audio: { format: { type: "audio/pcm" as const, rate: 24_000 }, output: { voice: "marin" as const } },
      store: false,
    },
  };
}
