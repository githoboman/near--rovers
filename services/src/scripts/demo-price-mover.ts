import { NearAiCloudClient } from "../ai/nearAiClient.ts";
import { loadConfig } from "../config.ts";
import { PerpetuaDatabase } from "../db/index.ts";
import { PageGeneratorService } from "../generator/index.ts";
import { PerpetuaIndexer } from "../indexer/index.ts";
import { PerpetuaNearClient } from "../near/client.ts";

async function main(): Promise<void> {
  const claimId = Number(process.env.CLAIM_ID || process.argv[2] || 2);
  const outcome =
    (process.env.OUTCOME || process.argv[3] || "Yes") === "No" ? "No" : "Yes";
  const depositNear = process.env.AMOUNT_NEAR || process.argv[4] || "4";

  const config = loadConfig();
  if (!config.contractId) {
    throw new Error("CONTRACT_ID must be set to run live demo trade");
  }

  const db = new PerpetuaDatabase(config.dbPath);
  const nearClient = new PerpetuaNearClient(config);
  const aiClient = new NearAiCloudClient({
    baseUrl: config.nearAiBaseUrl,
    apiKey: config.nearAiApiKey,
  });
  const indexer = new PerpetuaIndexer(config, db, nearClient);
  const generator = new PageGeneratorService(config, db, nearClient, aiClient);

  await indexer.syncOnce("demo-before");
  const claimBefore = db.getClaim(claimId);
  const marketBefore = claimBefore
    ? db.getMarket(claimId, claimBefore.current_epoch)
    : null;
  if (!claimBefore || !marketBefore) {
    throw new Error(`Claim #${claimId} not found on contract ${config.contractId}`);
  }

  const pageBefore = await generator.generateAndPublishPage(claimBefore, marketBefore, {
    submitOnChain: false,
  });

  console.log(
    `[demo] BEFORE trade: Claim #${claimId} YES=${(pageBefore.yes_price_e6 / 10_000).toFixed(2)}% page_hash=${pageBefore.page_hash.slice(0, 12)}...`,
  );
  console.log(`[demo] BEFORE lead: ${pageBefore.sentences[0]?.text}`);

  const buyTx = await nearClient.buy({
    claimId,
    outcome,
    depositNear,
  });
  console.log(
    `[demo] Executed buy(${outcome}, ${depositNear} NEAR) tx=${buyTx}`,
  );

  await indexer.syncOnce("demo-after");
  const claimAfter = db.getClaim(claimId)!;
  const marketAfter = db.getMarket(claimId, claimAfter.current_epoch)!;
  const pageAfter = await generator.generateAndPublishPage(claimAfter, marketAfter, {
    submitOnChain: true,
  });

  console.log(
    `[demo] AFTER trade:  Claim #${claimId} YES=${(pageAfter.yes_price_e6 / 10_000).toFixed(2)}% page_hash=${pageAfter.page_hash.slice(0, 12)}... set_page_hash_tx=${pageAfter.submitted_tx_hash ?? "skipped"}`,
  );
  console.log(`[demo] AFTER lead:  ${pageAfter.sentences[0]?.text}`);

  db.close();
}

main().catch((err) => {
  console.error("[demo] failed:", err);
  process.exit(1);
});
