import { loadConfig } from "../config.ts";
import { PerpetuaNearClient } from "../near/client.ts";

export interface SeedClaimSpec {
  id: number;
  text: string;
  category: "audit_status" | "authorship" | "tvl";
  evidence_uris: string[];
  initialBuyOutcome?: "Yes" | "No";
  initialBuyNear?: string;
}

export const SEED_CLAIMS: SeedClaimSpec[] = [
  {
    id: 1,
    text: "Uniswap v3 core contracts passed independent audits by Trail of Bits and ABDK prior to May 2021 mainnet launch",
    category: "audit_status",
    evidence_uris: ["https://github.com/Uniswap/v3-core/tree/main/audits"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "3.0",
  },
  {
    id: 2,
    text: "Ref Finance v2 AMM router underwent formal verification of invariant bounds before v2.0 deployment on NEAR",
    category: "audit_status",
    evidence_uris: ["https://guide.ref.finance/developers/audits"],
  },
  {
    id: 3,
    text: "Lido stETH maintained over $20B TVL across every quarter of 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/lido"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "1.5",
  },
  {
    id: 4,
    text: "NEAR Intents Verifier contract (intents.near) had zero critical unresolved findings at public release",
    category: "audit_status",
    evidence_uris: ["https://docs.near-intents.org/security-compliance/security"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "1.8",
  },
  {
    id: 5,
    text: "Burrow Cash lending protocol was originally co-authored by the Proximity Labs engineering team",
    category: "authorship",
    evidence_uris: ["https://github.com/burrowcash/burrow"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "1.5",
  },
  {
    id: 6,
    text: "Aave v3 cross-chain Portal bridge accounted for more than 10% of Aave protocol TVL in 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/aave-v3", "https://docs.aave.com"],
    initialBuyOutcome: "No",
    initialBuyNear: "2.5",
  },
  {
    id: 7,
    text: "MakerDAO Endgame SubDAO contracts were audited by ChainSecurity prior to Sky rebrand migration",
    category: "audit_status",
    evidence_uris: ["https://github.com/makerdao/dss"],
  },
  {
    id: 8,
    text: "Aurora Engine EVM runtime on NEAR was primarily built by the Aurora Labs team spun out of NEAR Inc",
    category: "authorship",
    evidence_uris: ["https://github.com/aurora-is-near/aurora-engine"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "3.0",
  },
  {
    id: 9,
    text: "EigenLayer restaking TVL surpassed $15B solely from native ETH restakers without LST caps",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/eigenlayer"],
    initialBuyOutcome: "No",
    initialBuyNear: "2.0",
  },
  {
    id: 10,
    text: "Curve Finance Vyper 0.2.15 reentrancy exploit resulted from a compiler bug rather than Curve application logic",
    category: "audit_status",
    evidence_uris: ["https://hackmd.io/@LlamaRisk/BJzSG8a7n"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "2.8",
  },
  {
    id: 11,
    text: "Rainbow Bridge v1 trustless ETH-to-NEAR light client was authored without any centralized validator multisig fallback",
    category: "authorship",
    evidence_uris: ["https://github.com/aurora-is-near/rainbow-bridge"],
  },
  {
    id: 12,
    text: "Ethena USDe reached $5B circulating supply while backing over 80% with hedged ETH perpetual positions",
    category: "tvl",
    evidence_uris: ["https://app.ethena.fi/dashboards/solvency"],
  },
  {
    id: 13,
    text: "Compound III (Comet) immutable deployment uses a single borrowable asset per market instance",
    category: "audit_status",
    evidence_uris: ["https://github.com/compound-finance/comet"],
    initialBuyOutcome: "Yes",
    initialBuyNear: "2.4",
  },
  {
    id: 14,
    text: "Meta Pool liquid staking contract (meta-pool.near) was founded and built by Narwallets / Meta Pool core contributors",
    category: "authorship",
    evidence_uris: ["https://github.com/Meta-Pool/liquid-staking-contract"],
  },
  {
    id: 15,
    text: "Pendle Finance TVL exceeded $4B predominantly due to EigenLayer points-era PT/YT markets",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/pendle"],
  },
  {
    id: 16,
    text: "Wormhole NTT framework requires guardian VAA attestation on every cross-chain token mint",
    category: "audit_status",
    evidence_uris: ["https://github.com/wormhole-foundation/native-token-transfers"],
  },
  {
    id: 17,
    text: "Sweat Economy NEAR token contracts were co-developed with NEAR Core / Pagoda engineering support",
    category: "authorship",
    evidence_uris: ["https://near.org/blog"],
  },
  {
    id: 18,
    text: "Hyperliquid L1 bridge USDC TVL exceeded all Arbitrum perpetual DEX rivals combined in early 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/hyperliquid"],
  },
  {
    id: 19,
    text: "Linear Protocol (linear-protocol.near) published full OtterSec and BlockSec audits before v2 staking launch",
    category: "audit_status",
    evidence_uris: ["https://github.com/linear-protocol/LiNEAR"],
  },
  {
    id: 20,
    text: "Jito MEV client and staking contracts on Solana were created independently from Solana Labs core",
    category: "authorship",
    evidence_uris: ["https://github.com/jito-foundation/jito-solana"],
  },
  {
    id: 21,
    text: "Arbitrum Nitro TVL double-counts bridged canonical ETH alongside native L2 governance tokens in headline charts",
    category: "tvl",
    evidence_uris: ["https://l2beat.com/scaling/projects/arbitrum"],
  },
  {
    id: 22,
    text: "Nearblocks / FastNEAR indexers rely on Lake Framework S3 blocks rather than direct validator RPC polling",
    category: "authorship",
    evidence_uris: ["https://docs.fastnear.com/neardata"],
  },
  {
    id: 23,
    text: "Euler v2 modular vaults completed at least four independent security audits plus a formal verification contest",
    category: "audit_status",
    evidence_uris: ["https://docs.euler.finance/security/audits"],
  },
  {
    id: 24,
    text: "Solana Kamino Finance TVL surpassed $2B without relying on circular recursive leverage counting",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/kamino"],
  },
];

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.contractId) {
    throw new Error("CONTRACT_ID must be set in environment before seeding claims");
  }
  const nearClient = new PerpetuaNearClient(config);
  if (!nearClient.hasResolverSigner()) {
    throw new Error(
      "NEAR_RESOLVER_ACCOUNT_ID and NEAR_RESOLVER_PRIVATE_KEY must be set to seed on-chain claims",
    );
  }

  const epochLengthNs =
    process.env.SEED_EPOCH_LENGTH_NS || String(7 * 86_400 * 1_000_000_000);
  const depositNear = process.env.SEED_DEPOSIT_NEAR || "0.08";
  const withTrades = process.env.SEED_WITH_TRADES === "true";

  const existingCount = await nearClient.getClaimsCount();
  console.log(`[seed] existing on-chain claims: ${existingCount}`);

  for (const spec of SEED_CLAIMS) {
    if (spec.id <= existingCount) {
      console.log(`[seed] skipping claim #${spec.id} (already created)`);
      continue;
    }

    const tx = await nearClient.createClaim({
      text: spec.text,
      evidence_uris: spec.evidence_uris,
      category: spec.category,
      epoch_length_ns: epochLengthNs,
      depositNear,
    });
    console.log(`[seed] created claim #${spec.id} (${spec.category}) tx=${tx}`);

    if (withTrades && spec.initialBuyOutcome && spec.initialBuyNear) {
      const tradeTx = await nearClient.buy({
        claimId: spec.id,
        outcome: spec.initialBuyOutcome,
        minShares: "1",
        depositNear: spec.initialBuyNear,
      });
      console.log(
        `[seed] seeded trade on #${spec.id} (${spec.initialBuyOutcome} ${spec.initialBuyNear} NEAR) tx=${tradeTx}`,
      );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed-claims.ts")) {
  main().catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
}
