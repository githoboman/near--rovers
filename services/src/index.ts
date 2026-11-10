import { NearAiCloudClient } from "./ai/nearAiClient.ts";
import { loadConfig } from "./config.ts";
import { PerpetuaDatabase } from "./db/index.ts";
import { PageGeneratorService } from "./generator/index.ts";
import { PerpetuaIndexer } from "./indexer/index.ts";
import { JuryService } from "./jury/index.ts";
import { PerpetuaNearClient } from "./near/client.ts";
import { PerpetuaOrchestrator } from "./orchestrator.ts";
import { createPerpetuaServer } from "./server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new PerpetuaDatabase(config.dbPath);
  const nearClient = new PerpetuaNearClient(config);
  const aiClient = new NearAiCloudClient({
    baseUrl: config.nearAiBaseUrl,
    apiKey: config.nearAiApiKey,
  });

  const indexer = new PerpetuaIndexer(config, db, nearClient);
  const jury = new JuryService(config, db, nearClient, aiClient);
  const generator = new PageGeneratorService(config, db, nearClient, aiClient);
  const orchestrator = new PerpetuaOrchestrator({
    config,
    db,
    indexer,
    jury,
    generator,
  });

  const server = createPerpetuaServer({ config, db, orchestrator });
  server.listen(config.port, () => {
    console.log(
      `[perpetua-services] HTTP API listening on http://localhost:${config.port} (contract=${config.contractId || "UNCONFIGURED"}, rpc=${config.nearRpcUrl})`,
    );
  });

  let inFlight = false;
  const run = async (trigger: string) => {
    if (inFlight || !nearClient.isConfigured()) return;
    inFlight = true;
    try {
      const result = await orchestrator.runCycle(trigger);
      if (
        result.sync.pricePointsRecorded > 0 ||
        result.rulingsProcessed > 0 ||
        result.pagesGenerated > 0
      ) {
        console.log(
          `[perpetua-services] cycle(${trigger}): claims=${result.sync.claimsSynced}, pricePoints=${result.sync.pricePointsRecorded}, rulings=${result.rulingsProcessed}, pages=${result.pagesGenerated}`,
        );
      }
    } catch (err) {
      console.error("[perpetua-services] cycle error:", err);
    } finally {
      inFlight = false;
    }
  };

  await run("startup");
  const timer = setInterval(() => {
    void run("poll");
  }, config.pollIntervalMs);

  const shutdown = () => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[perpetua-services] fatal:", err);
  process.exit(1);
});
