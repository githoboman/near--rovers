import { NearAiCloudClient } from "../ai/nearAiClient.ts";
import { loadConfig } from "../config.ts";
import { PerpetuaDatabase } from "../db/index.ts";
import { PageGeneratorService } from "../generator/index.ts";
import { PerpetuaIndexer } from "../indexer/index.ts";
import { JuryService } from "../jury/index.ts";
import { PerpetuaNearClient } from "../near/client.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const claimId = Number(process.env.E2E_CLAIM_ID || process.argv[2] || 1);
  const buy1Near = process.env.E2E_BUY1_NEAR || "0.02";
  const buy2Near = process.env.E2E_BUY2_NEAR || "0.06";
  const hedgeNoNear = process.env.E2E_HEDGE_NO_NEAR || "0.01";

  const config = loadConfig();
  if (!config.contractId) {
    throw new Error("NEAR_CONTRACT_ID / CONTRACT_ID must be set");
  }
  if (!config.nearAiApiKey) {
    throw new Error("NEAR_AI_API_KEY must be set for live jury + page generation e2e");
  }

  const nearClient = new PerpetuaNearClient(config);
  if (!nearClient.hasResolverSigner()) {
    throw new Error("NEAR_RESOLVER_ACCOUNT_ID and NEAR_RESOLVER_PRIVATE_KEY must be set");
  }

  const db = new PerpetuaDatabase(config.dbPath);
  const aiClient = new NearAiCloudClient({
    baseUrl: config.nearAiBaseUrl,
    apiKey: config.nearAiApiKey,
  });
  const indexer = new PerpetuaIndexer(config, db, nearClient);
  const jury = new JuryService(config, db, nearClient, aiClient);
  const generator = new PageGeneratorService(config, db, nearClient, aiClient);

  try {
    const contractConfig = await nearClient.getConfig();
    console.log(
      `[e2e] contract=${config.contractId} resolver=${contractConfig.resolver_account_id} escalation_bond=${contractConfig.escalation_bond} challenge_window_ns=${contractConfig.challenge_window_ns}`,
    );

    const initialClaim = await nearClient.getClaim(claimId);
    if (!initialClaim) {
      throw new Error(`Claim #${claimId} not found on contract ${config.contractId}`);
    }
    const startEpoch = initialClaim.current_epoch;
    console.log(
      `[e2e] Step 1: Target claim #${claimId} ("${initialClaim.text.slice(0, 72)}...") epoch=${startEpoch}`,
    );

    // Small hedge on NO so whichever verdict the 3-model jury renders (True/False/Unresolved), redeem() has positive payout.
    const hedgeTx = await nearClient.buy({
      claimId,
      outcome: "No",
      depositNear: hedgeNoNear,
    });
    const buy1Tx = await nearClient.buy({
      claimId,
      outcome: "Yes",
      depositNear: buy1Near,
    });
    console.log(`[e2e] Step 2: Initial trades buy(No,${hedgeNoNear})=${hedgeTx} buy(Yes,${buy1Near})=${buy1Tx}`);

    await indexer.syncOnce("e2e-step2");
    const claimAfterBuy1 = db.getClaim(claimId)!;
    const marketAfterBuy1 = db.getMarket(claimId, startEpoch)!;
    const page1 = await generator.generateAndPublishPage(claimAfterBuy1, marketAfterBuy1, {
      submitOnChain: true,
    });
    const claimOnChain1 = await nearClient.getClaim(claimId);
    console.log(
      `[e2e] Step 3: Generated Page v1 YES=${(page1.yes_price_e6 / 10_000).toFixed(2)}% page_hash=${page1.page_hash} set_page_hash_tx=${page1.submitted_tx_hash} on_chain_hash=${claimOnChain1?.page_hash}`,
    );
    if (claimOnChain1?.page_hash !== page1.page_hash) {
      throw new Error(
        `On-chain page hash mismatch after v1: expected ${page1.page_hash}, got ${claimOnChain1?.page_hash}`,
      );
    }

    const buy2Tx = await nearClient.buy({
      claimId,
      outcome: "Yes",
      depositNear: buy2Near,
    });
    console.log(`[e2e] Step 4: Price-moving trade buy(Yes,${buy2Near})=${buy2Tx}`);

    await indexer.syncOnce("e2e-step4");
    const claimAfterBuy2 = db.getClaim(claimId)!;
    const marketAfterBuy2 = db.getMarket(claimId, startEpoch)!;
    const page2 = await generator.generateAndPublishPage(claimAfterBuy2, marketAfterBuy2, {
      submitOnChain: true,
    });
    const claimOnChain2 = await nearClient.getClaim(claimId);
    console.log(
      `[e2e] Step 5: Regenerated Page v2 YES=${(page2.yes_price_e6 / 10_000).toFixed(2)}% page_hash=${page2.page_hash} set_page_hash_tx=${page2.submitted_tx_hash} on_chain_hash=${claimOnChain2?.page_hash}`,
    );
    if (page2.page_hash === page1.page_hash) {
      throw new Error("Expected regenerated page hash to change after price-moving trade");
    }

    const escalateDepositYocto = (
      BigInt(contractConfig.escalation_bond) + 10_000_000_000_000_000_000_000n
    ).toString();
    const escTx = await nearClient.escalate({
      claimId,
      assertedOutcome: "Yes",
      depositYocto: escalateDepositYocto,
    });
    console.log(`[e2e] Step 6: Escalated claim #${claimId} tx=${escTx}`);

    await indexer.syncOnce("e2e-step6");
    const claimEsc = db.getClaim(claimId)!;
    const marketEsc = db.getMarket(claimId, startEpoch)!;
    const ruling = await jury.resolveEscalatedClaim(claimEsc, marketEsc);
    const marketRuled = await nearClient.getMarket(claimId, startEpoch);
    console.log(
      `[e2e] Step 7: Jury ruling verdict=${ruling.verdict} models=${ruling.votes.length} tee_verified=${ruling.votes.filter((v) => v.signatureValid).length}/${ruling.votes.length} attestation=${ruling.attestation_hash} submit_ruling_tx=${ruling.submitted_tx_hash} market_status=${marketRuled?.status}`,
    );
    if (marketRuled?.status !== "Ruled") {
      throw new Error(`Expected market status Ruled, got ${marketRuled?.status}`);
    }

    const challengeWindowMs = Number(BigInt(contractConfig.challenge_window_ns) / 1_000_000n);
    const waitMs = Math.max(challengeWindowMs + 4_000, 5_000);
    console.log(`[e2e] Step 8: Waiting ${(waitMs / 1000).toFixed(1)}s for challenge window (${challengeWindowMs}ms)...`);
    await sleep(waitMs);

    const settleTx = await nearClient.settle(claimId);
    await indexer.syncOnce("e2e-step8");
    const claimAfterSettle = await nearClient.getClaim(claimId);
    const settledEpochMarket = await nearClient.getMarket(claimId, startEpoch);
    console.log(
      `[e2e] Step 9: Settled epoch=${startEpoch} tx=${settleTx} epoch_status=${settledEpochMarket?.status} new_current_epoch=${claimAfterSettle?.current_epoch}`,
    );
    if (settledEpochMarket?.status !== "Settled") {
      throw new Error(`Expected epoch ${startEpoch} status Settled, got ${settledEpochMarket?.status}`);
    }
    if ((claimAfterSettle?.current_epoch ?? 0) !== startEpoch + 1) {
      throw new Error(
        `Expected new current_epoch ${startEpoch + 1}, got ${claimAfterSettle?.current_epoch}`,
      );
    }

    const posBeforeRedeem = await nearClient.getPosition(
      claimId,
      config.resolverAccountId,
      startEpoch,
    );
    const redeemTx = await nearClient.redeem(claimId, startEpoch);
    const posAfterRedeem = await nearClient.getPosition(
      claimId,
      config.resolverAccountId,
      startEpoch,
    );
    console.log(
      `[e2e] Step 10: Redeemed epoch=${startEpoch} tx=${redeemTx} shares_before=(YES:${posBeforeRedeem.yes_shares}, NO:${posBeforeRedeem.no_shares}) shares_after=(YES:${posAfterRedeem.yes_shares}, NO:${posAfterRedeem.no_shares})`,
    );

    // Refresh final page in new epoch
    const claimFinal = db.getClaim(claimId)!;
    const marketFinal = db.getMarket(claimId, claimFinal.current_epoch)!;
    const pageFinal = await generator.generateAndPublishPage(claimFinal, marketFinal, {
      submitOnChain: true,
    });
    console.log(
      `[e2e] Complete! Epoch ${claimFinal.current_epoch} live, final page_hash=${pageFinal.page_hash} set_page_hash_tx=${pageFinal.submitted_tx_hash}`,
    );
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[e2e] failed:", err);
  process.exit(1);
});
