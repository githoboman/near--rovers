import { priceE6, YOCTO_PER_NEAR } from "./amm";
import {
  ArticleSentence,
  ClaimBundle,
  ClaimView,
  GeneratedArticle,
  JuryRulingRecord,
  MarketView,
  PricePoint,
} from "./types";

interface SeedSpec {
  id: number;
  text: string;
  category: "audit_status" | "authorship" | "tvl";
  evidence_uris: string[];
  yesNear: number;
  noNear: number;
  status?: "Open" | "Escalated" | "Ruled" | "Settled";
  contextDetail: string;
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: 1,
    text: "Uniswap v3 core contracts passed independent audits by Trail of Bits and ABDK prior to May 2021 mainnet launch",
    category: "audit_status",
    evidence_uris: ["https://github.com/Uniswap/v3-core/tree/main/audits"],
    yesNear: 1.4,
    noNear: 14.2,
    contextDetail: "Trail of Bits and ABDK both published dated v3-core audit reports ahead of the May 2021 deployment.",
  },
  {
    id: 2,
    text: "Ref Finance v2 AMM router underwent formal verification of invariant bounds before v2.0 deployment on NEAR",
    category: "audit_status",
    evidence_uris: ["https://guide.ref.finance/developers/audits"],
    yesNear: 4.8,
    noNear: 5.1,
    contextDetail: "Traditional smart-contract audits exist, but market participants dispute whether formal verification covered every v2 router path.",
  },
  {
    id: 3,
    text: "Lido stETH maintained over $20B TVL across every quarter of 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/lido"],
    yesNear: 2.1,
    noNear: 8.6,
    contextDetail: "DefiLlama historical ETH-denominated TVL snapshots show quarterly USD fluctuations tied to ETH spot price.",
  },
  {
    id: 4,
    text: "NEAR Intents Verifier contract (intents.near) had zero critical unresolved findings at public release",
    category: "audit_status",
    evidence_uris: ["https://docs.near-intents.org/security-compliance/security"],
    yesNear: 3.1,
    noNear: 9.8,
    contextDetail: "Security disclosures and bug bounty records document audit remediations prior to production ramp.",
  },
  {
    id: 5,
    text: "Burrow Cash lending protocol was originally co-authored by the Proximity Labs engineering team",
    category: "authorship",
    evidence_uris: ["https://github.com/burrowcash/burrow"],
    yesNear: 2.5,
    noNear: 7.5,
    contextDetail: "Early commit history and grant announcements attribute initial design and core contracts to contributors tied to Proximity.",
  },
  {
    id: 6,
    text: "Aave v3 cross-chain Portal bridge accounted for more than 10% of Aave protocol TVL in 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/aave-v3", "https://docs.aave.com"],
    yesNear: 11.4,
    noNear: 1.8,
    contextDetail: "On-chain Portal volume remained minimal relative to Aave v3 core liquidity pools across Ethereum and L2s.",
  },
  {
    id: 7,
    text: "MakerDAO Endgame SubDAO contracts were audited by ChainSecurity prior to Sky rebrand migration",
    category: "audit_status",
    evidence_uris: ["https://github.com/makerdao/dss"],
    yesNear: 3.9,
    noNear: 6.4,
    contextDetail: "Scope coverage across governance migration modules vs core Sky token contracts remains actively debated.",
  },
  {
    id: 8,
    text: "Aurora Engine EVM runtime on NEAR was primarily built by the Aurora Labs team spun out of NEAR Inc",
    category: "authorship",
    evidence_uris: ["https://github.com/aurora-is-near/aurora-engine"],
    yesNear: 1.2,
    noNear: 15.0,
    contextDetail: "Repository authorship and corporate spin-out announcements clearly trace Aurora Engine to Aurora Labs.",
  },
  {
    id: 9,
    text: "EigenLayer restaking TVL surpassed $15B solely from native ETH restakers without LST caps",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/eigenlayer"],
    yesNear: 9.2,
    noNear: 2.3,
    contextDetail: "LST deposit caps played a major role in early TVL composition alongside native Beacon Chain pods.",
  },
  {
    id: 10,
    text: "Curve Finance Vyper 0.2.15 reentrancy exploit resulted from a compiler bug rather than Curve application logic",
    category: "audit_status",
    evidence_uris: ["https://hackmd.io/@LlamaRisk/BJzSG8a7n"],
    yesNear: 1.5,
    noNear: 13.8,
    contextDetail: "Post-mortems confirmed malfunctioning @nonreentrant lock code generation in specific Vyper compiler versions.",
  },
  {
    id: 11,
    text: "Rainbow Bridge v1 trustless ETH-to-NEAR light client was authored without any centralized validator multisig fallback",
    category: "authorship",
    evidence_uris: ["https://github.com/aurora-is-near/rainbow-bridge"],
    yesNear: 4.5,
    noNear: 4.7,
    contextDetail: "Light client verification is permissionless, though watchers and emergency upgrade governance remain contested.",
  },
  {
    id: 12,
    text: "Ethena USDe reached $5B circulating supply while backing over 80% with hedged ETH perpetual positions",
    category: "tvl",
    evidence_uris: ["https://app.ethena.fi/dashboards/solvency"],
    yesNear: 4.2,
    noNear: 5.8,
    contextDetail: "Reserve composition oscillates between ETH perp basis, BTC futures, and liquid stablecoins across market regimes.",
  },
  {
    id: 13,
    text: "Compound III (Comet) immutable deployment uses a single borrowable asset per market instance",
    category: "audit_status",
    evidence_uris: ["https://github.com/compound-finance/comet"],
    yesNear: 1.6,
    noNear: 12.1,
    contextDetail: "Comet architecture restricts each deployment to one base asset with multi-collateral risk parameters.",
  },
  {
    id: 14,
    text: "Meta Pool liquid staking contract (meta-pool.near) was founded and built by Narwallets / Meta Pool core contributors",
    category: "authorship",
    evidence_uris: ["https://github.com/Meta-Pool/liquid-staking-contract"],
    yesNear: 2.2,
    noNear: 8.8,
    contextDetail: "Commit logs and launch posts credit the original Meta Pool / Narwallets engineering group.",
  },
  {
    id: 15,
    text: "Pendle Finance TVL exceeded $4B predominantly due to EigenLayer points-era PT/YT markets",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/pendle"],
    yesNear: 3.0,
    noNear: 7.2,
    contextDetail: "LRT yield-tokenization markets drove the sharpest TVL expansion cycle in Pendle history.",
  },
  {
    id: 16,
    text: "Wormhole NTT framework requires guardian VAA attestation on every cross-chain token mint",
    category: "audit_status",
    evidence_uris: ["https://github.com/wormhole-foundation/native-token-transfers"],
    yesNear: 4.9,
    noNear: 5.2,
    contextDetail: "NTT supports configurable transceivers, including custom threshold verifiers alongside the Wormhole Guardian network.",
  },
  {
    id: 17,
    text: "Sweat Economy NEAR token contracts were co-developed with NEAR Core / Pagoda engineering support",
    category: "authorship",
    evidence_uris: ["https://near.org/blog"],
    yesNear: 3.8,
    noNear: 5.4,
    contextDetail: "Onboarding architecture used NEAR meta-transactions and batch account creation tooling with ecosystem engineering help.",
  },
  {
    id: 18,
    text: "Hyperliquid L1 bridge USDC TVL exceeded all Arbitrum perpetual DEX rivals combined in early 2025",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/hyperliquid"],
    yesNear: 2.6,
    noNear: 8.9,
    contextDetail: "Arbitrum bridge escrow balances showed Hyperliquid holding the majority share of perp-DEX USDC deposits.",
  },
  {
    id: 19,
    text: "Linear Protocol (linear-protocol.near) published full OtterSec and BlockSec audits before v2 staking launch",
    category: "audit_status",
    evidence_uris: ["https://github.com/linear-protocol/LiNEAR"],
    yesNear: 4.0,
    noNear: 5.5,
    contextDetail: "Public audit PDFs exist in the repository; traders dispute exact release dates relative to v2 proxy upgrades.",
  },
  {
    id: 20,
    text: "Jito MEV client and staking contracts on Solana were created independently from Solana Labs core",
    category: "authorship",
    evidence_uris: ["https://github.com/jito-foundation/jito-solana"],
    yesNear: 2.0,
    noNear: 9.0,
    contextDetail: "Jito Labs developed the out-of-protocol MEV block engine and tip distribution programs separately from Solana Labs.",
  },
  {
    id: 21,
    text: "Arbitrum Nitro TVL double-counts bridged canonical ETH alongside native L2 governance tokens in headline charts",
    category: "tvl",
    evidence_uris: ["https://l2beat.com/scaling/projects/arbitrum"],
    yesNear: 4.6,
    noNear: 4.6,
    contextDetail: "Methodology differences between L2BEAT Total Value Secured and DefiLlama DeFi TVL create persistent disputes.",
  },
  {
    id: 22,
    text: "Nearblocks / FastNEAR indexers rely on Lake Framework S3 blocks rather than direct validator RPC polling",
    category: "authorship",
    evidence_uris: ["https://docs.fastnear.com/neardata"],
    yesNear: 6.8,
    noNear: 3.2,
    contextDetail: "FastNEAR serves Neardata directly from custom nearcore-instrumented nodes rather than Lake S3 buckets.",
  },
  {
    id: 23,
    text: "Euler v2 modular vaults completed at least four independent security audits plus a formal verification contest",
    category: "audit_status",
    evidence_uris: ["https://docs.euler.finance/security/audits"],
    yesNear: 1.9,
    noNear: 10.4,
    contextDetail: "Euler v2 published multi-firm audit reports and Cantina competition findings ahead of mainnet rollout.",
  },
  {
    id: 24,
    text: "Solana Kamino Finance TVL surpassed $2B without relying on circular recursive leverage counting",
    category: "tvl",
    evidence_uris: ["https://defillama.com/protocol/kamino"],
    yesNear: 5.2,
    noNear: 4.4,
    contextDetail: "Analysts debate whether multiply-loop collateral inflates gross supplied liquidity figures vs net TVL.",
  },
];

export function confidenceBand(yesPriceE6: number): "high" | "contested" | "low" {
  if (yesPriceE6 >= 650_000) return "high";
  if (yesPriceE6 <= 350_000) return "low";
  return "contested";
}

function deterministicHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(4);
}

/**
 * Generates confidence-annotated encyclopedia sentences and markdown directly
 * from the current market price and claim metadata (offline / demo mirror of Phase 2).
 */
export function synthesizeArticleFromMarket(
  claim: ClaimView,
  market: MarketView,
  ruling: JuryRulingRecord | null,
  contextDetail?: string
): GeneratedArticle {
  const yesPct = (market.yes_price_e6 / 10_000).toFixed(1);
  const noPct = (market.no_price_e6 / 10_000).toFixed(1);
  const band = confidenceBand(market.yes_price_e6);
  const primarySource = claim.evidence_uris[0] ?? "on-chain claim record";

  let stanceLead: string;
  let epistemicTone: string;
  if (band === "high") {
    stanceLead = `Current market pricing assigns strong empirical backing (${yesPct}% YES) to the claim that ${claim.text.charAt(0).toLowerCase()}${claim.text.slice(1)}.`;
    epistemicTone = `Traders defending the affirmative side have concentrated liquidity into YES shares, driving implied odds well above the 65% consensus threshold.`;
  } else if (band === "low") {
    stanceLead = `Live market pricing reflects prevailing skepticism (${yesPct}% YES / ${noPct}% NO) regarding the claim that ${claim.text.charAt(0).toLowerCase()}${claim.text.slice(1)}.`;
    epistemicTone = `Heavy NO accumulation indicates traders view the statement as inaccurate, overstated, or missing material caveats in primary disclosures.`;
  } else {
    stanceLead = `Evidence surrounding the claim that ${claim.text.charAt(0).toLowerCase()}${claim.text.slice(1)} remains actively contested at ${yesPct}% YES.`;
    epistemicTone = `Because implied probability sits inside the 35%–65% dispute band, neither affirmative nor dissenting market participants hold decisive conviction.`;
  }

  const evidenceLine = contextDetail
    ? `${contextDetail} Primary reference cited by the market creator: ${primarySource}.`
    : `Market participants evaluate this assertion against cited primary records (${primarySource}).`;

  const escalationLine =
    market.status === "Open"
      ? `Epoch ${market.epoch} remains open for continuous CPMM price discovery; any participant may escalate the claim to an attested 3-model NEAR AI Cloud jury by posting the dispute bond.`
      : market.status === "Escalated"
      ? `Trading is frozen in Epoch ${market.epoch} following an active escalation at ${((market.snap_yes_price_e6 ?? market.yes_price_e6) / 10_000).toFixed(1)}% YES while the AI jury evaluates the evidence packet.`
      : ruling
      ? `An attested AI jury returned verdict ${ruling.finalVerdict} (attestation ${ruling.attestationHash.slice(0, 14)}...) across ${ruling.modelVotes.length} TEE models.`
      : `Epoch ${market.epoch} entered ${market.status} status with verdict ${market.verdict ?? "pending"}.`;

  const secondaryConfidence =
    band === "high"
      ? Math.max(550_000, market.yes_price_e6 - 80_000)
      : band === "low"
      ? Math.min(450_000, market.yes_price_e6 + 90_000)
      : market.yes_price_e6;

  const sentences: ArticleSentence[] = [
    {
      text: stanceLead,
      confidenceE6: market.yes_price_e6,
      band,
      citation: `Epoch #${market.epoch} CPMM spot`,
    },
    {
      text: evidenceLine,
      confidenceE6: secondaryConfidence,
      band: confidenceBand(secondaryConfidence),
      citation: primarySource,
    },
    {
      text: epistemicTone,
      confidenceE6: market.yes_price_e6,
      band,
      citation: `Fee pool & reserve ratio`,
    },
    {
      text: escalationLine,
      confidenceE6: market.status === "Open" ? 950_000 : market.yes_price_e6,
      band: market.status === "Open" ? "high" : band,
      citation: "Perpetua on-chain state",
    },
  ];

  const markdown = sentences
    .map((s) => `${s.text} <!-- conf:${(s.confidenceE6 / 10_000).toFixed(1)}% -->`)
    .join("\n\n");

  const model = "demo-local-synthesizer";
  const promptHash = deterministicHex(`prompt:${claim.id}:${claim.text_hash}`);
  const pageHash = deterministicHex(
    `${market.yes_price_e6}:${market.epoch}:${market.status}:${promptHash}:${model}`
  );

  return {
    claimId: claim.id,
    epoch: market.epoch,
    title: claim.text,
    summary: stanceLead,
    sentences,
    markdown,
    model,
    promptHash,
    snapshotPriceE6: market.yes_price_e6,
    generatedAtMs: Date.now(),
    pageHash,
  };
}

export function buildSeedBundles(): ClaimBundle[] {
  const baseMs = Date.now() - 1000 * 60 * 60 * 24;

  return SEED_SPECS.map((spec) => {
    const yesReserve = BigInt(Math.round(spec.yesNear * 1000)) * (YOCTO_PER_NEAR / 1000n);
    const noReserve = BigInt(Math.round(spec.noNear * 1000)) * (YOCTO_PER_NEAR / 1000n);
    const { yes: yesP, no: noP } = priceE6(yesReserve, noReserve);

    const openedNs = BigInt(baseMs) * 1_000_000n;
    const epochLenNs = 7n * 24n * 3600n * 1_000_000_000n;

    const claim: ClaimView = {
      id: spec.id,
      creator: "seed.perpetua.testnet",
      text: spec.text,
      text_hash: deterministicHex(spec.text),
      evidence_uris: spec.evidence_uris,
      category: spec.category,
      epoch_length: epochLenNs.toString(),
      current_epoch: 1,
      status: spec.status ?? "Open",
      page_hash: null,
      page_hash_updated_at: null,
      created_at: openedNs.toString(),
    };

    const vault = yesReserve > noReserve ? yesReserve : noReserve;
    const market: MarketView = {
      claim_id: spec.id,
      epoch: 1,
      yes_reserve: yesReserve.toString(),
      no_reserve: noReserve.toString(),
      collateral_vault: vault.toString(),
      outstanding_yes: (vault - yesReserve).toString(),
      outstanding_no: (vault - noReserve).toString(),
      fee_pool: ((YOCTO_PER_NEAR * 35n) / 1000n).toString(),
      fee_bps: 100,
      opened_at: openedNs.toString(),
      epoch_end: (openedNs + epochLenNs).toString(),
      status: spec.status ?? "Open",
      yes_price_e6: yesP,
      no_price_e6: noP,
      challenger: null,
      challenger_side: null,
      challenger_bond: "0",
      counter_challenger: null,
      counter_side: null,
      counter_bond: "0",
      escalated_at: null,
      snap_yes_price_e6: null,
      verdict: null,
      attestation_hash: null,
      ruled_at: null,
      challenge_deadline: null,
      settled_at: null,
      retained_liquidity: "0",
    };

    const mid1 = Math.round((500_000 + yesP) / 2);
    const mid2 = Math.round((mid1 + yesP) / 2);
    const history: PricePoint[] = [
      { timestampMs: baseMs, yesPriceE6: 500_000, eventLabel: "Epoch 1 seeded" },
      { timestampMs: baseMs + 4 * 3600_000, yesPriceE6: mid1, trader: "alice.testnet" },
      { timestampMs: baseMs + 11 * 3600_000, yesPriceE6: mid2, trader: "bob.testnet" },
      { timestampMs: baseMs + 20 * 3600_000, yesPriceE6: yesP, trader: "carol.testnet" },
    ];

    const article = synthesizeArticleFromMarket(claim, market, null, spec.contextDetail);
    claim.page_hash = article.pageHash;
    claim.page_hash_updated_at = (BigInt(Date.now()) * 1_000_000n).toString();

    return {
      claim,
      market,
      history,
      article,
      ruling: null,
    };
  });
}

