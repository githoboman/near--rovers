import { loadConfig } from "./config.ts";
import { PerpetuaDatabase } from "./db/index.ts";
import { PerpetuaIndexer } from "./indexer/index.ts";
import { PerpetuaNearClient } from "./near/client.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.contractId) {
    throw new Error("CONTRACT_ID is required to run standalone indexer");
  }
  const db = new PerpetuaDatabase(config.dbPath);
  const nearClient = new PerpetuaNearClient(config);
  const indexer = new PerpetuaIndexer(config, db, nearClient);

  const once = process.argv.includes("--once");
  const summary = await indexer.syncOnce("indexer-cli");
  console.log("[indexer] sync:", summary);

  if (once) {
    db.close();
    return;
  }

  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await indexer.syncOnce("indexer-poll");
    } finally {
      busy = false;
    }
  }, config.pollIntervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    db.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[indexer] fatal:", err);
  process.exit(1);
});
