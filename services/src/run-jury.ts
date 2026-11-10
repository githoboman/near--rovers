import { NearAiCloudClient } from "./ai/nearAiClient.ts";
import { loadConfig } from "./config.ts";
import { PerpetuaDatabase } from "./db/index.ts";
import { PerpetuaIndexer } from "./indexer/index.ts";
import { JuryService } from "./jury/index.ts";
import { PerpetuaNearClient } from "./near/client.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.contractId) {
    throw new Error("CONTRACT_ID is required to run jury runner");
  }
  const db = new PerpetuaDatabase(config.dbPath);
  const nearClient = new PerpetuaNearClient(config);
  const aiClient = new NearAiCloudClient({
    baseUrl: config.nearAiBaseUrl,
    apiKey: config.nearAiApiKey,
  });
  const indexer = new PerpetuaIndexer(config, db, nearClient);
  const jury = new JuryService(config, db, nearClient, aiClient);

  const summary = await indexer.syncOnce("jury-cli");
  console.log(
    `[jury] found ${summary.escalatedMarkets.length} escalated market(s)`,
  );

  for (const { claim, market } of summary.escalatedMarkets) {
    const ruling = await jury.resolveEscalatedClaim(claim, market);
    console.log(
      `[jury] claim #${claim.id} epoch ${market.epoch} -> verdict=${ruling.verdict} (${ruling.supermajority_count}/${ruling.total_models}), attestationHash=${ruling.attestation_hash}, tx=${ruling.submitted_tx_hash ?? "not-submitted"}`,
    );
  }

  db.close();
}

main().catch((err) => {
  console.error("[jury] fatal:", err);
  process.exit(1);
});
