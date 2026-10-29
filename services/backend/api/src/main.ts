// Entry point. Refuses to start unless TRADING_MODE=paper (practice only; no keys, no signing, no transactions).
import { ConfigError, loadConfig } from "./config.ts";
import { createPool } from "./db.ts";
import { MarkHub } from "./sse.ts";
import { createApiServer } from "./server.ts";

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(78); // EX_CONFIG
    }
    throw e;
  }
  const db = createPool(cfg.databaseUrl);
  const marks = new MarkHub(cfg.databaseUrl, cfg.marksChannel);
  await marks.start();
  const server = createApiServer({ cfg, db, marks });
  server.listen(cfg.port, cfg.host, () => console.log(`sentra api (practice) listening on ${cfg.host}:${cfg.port}`));
  const stop = () => {
    server.close();
    server.closeAllConnections();
    void marks.stop().then(() => db.end()).then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main();
