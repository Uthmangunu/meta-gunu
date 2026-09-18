export interface GatewayConfig {
  port: number;
  databaseUrl: string;
  apiToken: string;
  laptopConnectorToken: string;
  openAIKey?: string;
  liveModel: string;
  reasoningModel: string;
  monthlySpendLimitUsd: number;
  spendWarningRatio: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(): GatewayConfig {
  const development = (process.env.NODE_ENV ?? "development") === "development";
  const apiToken = process.env.META_GUNU_API_TOKEN ?? (development ? "local-development-only" : required("META_GUNU_API_TOKEN"));
  const laptopConnectorToken =
    process.env.LAPTOP_CONNECTOR_TOKEN ?? (development ? "local-connector-only" : required("LAPTOP_CONNECTOR_TOKEN"));

  return {
    port: Number(process.env.PORT ?? 8787),
    databaseUrl: required("DATABASE_URL"),
    apiToken,
    laptopConnectorToken,
    ...(process.env.OPENAI_API_KEY ? { openAIKey: process.env.OPENAI_API_KEY } : {}),
    liveModel: process.env.OPENAI_LIVE_MODEL ?? "gpt-live-1",
    reasoningModel: process.env.OPENAI_REASONING_MODEL ?? "gpt-6-astra",
    monthlySpendLimitUsd: Number(process.env.MONTHLY_SPEND_LIMIT_USD ?? 25),
    spendWarningRatio: Number(process.env.SPEND_WARNING_RATIO ?? 0.8),
  };
}
