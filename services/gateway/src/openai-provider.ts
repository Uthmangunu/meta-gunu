import OpenAI from "openai";

export interface ResearchResult {
  responseId: string;
  text: string;
  sources: Array<{ title: string; url: string }>;
}

export interface AIProvider {
  createLiveSession(sdp: string): Promise<unknown>;
  research(prompt: string, previousResponseId?: string): Promise<ResearchResult>;
}

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly liveModel: string,
    private readonly reasoningModel: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async createLiveSession(sdp: string): Promise<unknown> {
    // The current official endpoint is newer than some released SDK typings,
    // so this narrow boundary uses fetch while Responses uses the SDK.
    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: this.liveModel,
          instructions:
            "You are Musa, the Meta Gunu companion. Converse naturally. Delegate longer research, keep spoken updates concise, and close when the user says end session.",
          store: false,
        },
        transport: { type: "webrtc", sdp },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI Live session failed (${response.status})`);
    return response.json();
  }

  async research(prompt: string, previousResponseId?: string): Promise<ResearchResult> {
    const response = await this.client.responses.create({
      model: this.reasoningModel,
      instructions:
        "Answer as Musa. Research when useful, distinguish facts from inference, and provide a concise structured answer with source links.",
      input: prompt,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      store: false,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    });

    return {
      responseId: response.id,
      text: response.output_text,
      sources: extractSources(response.output),
    };
  }
}

function extractSources(output: unknown[]): Array<{ title: string; url: string }> {
  const sources = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.url === "string" && object.url.startsWith("http")) {
      sources.set(object.url, typeof object.title === "string" ? object.title : object.url);
    }
    Object.values(object).forEach(visit);
  };
  visit(output);
  return [...sources].map(([url, title]) => ({ title, url }));
}

export class UnconfiguredAIProvider implements AIProvider {
  private unavailable(): never {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  async createLiveSession(): Promise<never> {
    return this.unavailable();
  }
  async research(): Promise<never> {
    return this.unavailable();
  }
}
