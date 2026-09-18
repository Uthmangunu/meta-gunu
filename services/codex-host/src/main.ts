import { LaptopConnector } from "./connector.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const connector = new LaptopConnector({
  url: process.env.GATEWAY_WS_URL ?? "ws://localhost:8787/v1/laptop/connect",
  token: required("LAPTOP_CONNECTOR_TOKEN"),
  deviceId: process.env.LAPTOP_DEVICE_ID ?? "local-mac",
  model: process.env.CODEX_MODEL ?? "gpt-5.6-terra",
  workspace: required("CODEX_WORKSPACE"),
});

connector.start();
process.on("SIGINT", () => connector.stop());
process.on("SIGTERM", () => connector.stop());
