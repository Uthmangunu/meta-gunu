import { loadConfig } from "./config.js";
import { createGatewayServer, productionDependencies } from "./server.js";

const config = loadConfig();
const { dependencies, pool } = productionDependencies(config);
const server = createGatewayServer(config, dependencies);

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Meta Gunu gateway listening on http://127.0.0.1:${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
