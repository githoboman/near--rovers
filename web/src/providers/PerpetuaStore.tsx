"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { parseNearToYocto, PRICE_SCALE, quoteBuy, quoteSell, YOCTO_PER_NEAR } from "@/lib/amm";
import {
  CONTRACT_ID,
  ESCALATE_STORAGE_BUFFER_YOCTO,
  SERVICES_URL,
  buildBuyTx,
  buildChallengeRulingTx,
  buildCreateClaimTx,
  buildEscalateTx,
  buildRedeemTx,
  buildSellTx,
  buildSettleTx,
  fetchOnChainClaims,
  fetchOnChainClaimsCount,
  fetchOnChainConfig,
  fetchOnChainMarket,
  fetchOnChainPosition,
  isLiveContractConfigured,
} from "@/lib/near";
import { buildSeedBundles, synthesizeArticleFromMarket } from "@/lib/seedClaims";
import { useNear } from "@/providers/NearProvider";
import {
  ClaimBundle,
  ClaimView,
  ContractConfigView,
  JuryRulingRecord,
  MarketView,
  Outcome,
  PositionView,
  Verdict,
} from "@/lib/types";

export type DataSourceMode = "demo" | "live";

const DEFAULT_DEMO_CONFIG: ContractConfigView = {
  owner_id: "owner.perpetua.testnet",
  resolver_account_id: "resolver.perpetua.testnet",
  collateral_asset: "NativeNear",
  fee_bps: 100,
  escalation_bond: ((YOCTO_PER_NEAR * 5n) / 10n).toString(), // 0.5 NEAR
  challenge_window_ns: "15000000000", // 15s demo window
  jury_cost_fund: "0",
  next_claim_id: 25,
};

interface PerpetuaContextValue {
  mode: DataSourceMode;
  setMode: (mode: DataSourceMode) => void;
  config: ContractConfigView;
  bundles: ClaimBundle[];
  positions: Record<number, PositionView>;
  loading: boolean;
  lastError: string | null;
  getBundle: (claimId: number) => ClaimBundle | undefined;
  refreshAll: () => Promise<void>;
  refreshClaim: (claimId: number) => Promise<void>;
  executeBuy: (claimId: number, outcome: Outcome, amountNear: string) => Promise<void>;
  executeSell: (claimId: number, outcome: Outcome, sharesYocto: string) => Promise<void>;
  executeEscalate: (claimId: number, assertedOutcome?: Outcome) => Promise<void>;
  executeChallengeRuling: (claimId: number, assertedOutcome?: Outcome) => Promise<void>;
  executeCreateClaim: (input: {
    text: string;
    evidenceUris: string[];
    category: string;
    epochHours: number;
    seedNear: string;
  }) => Promise<number>;
  runDemoJuryFlow: (claimId: number, verdict: Verdict) => void;
  fastForwardDemoChallengeWindow: (claimId: number) => void;
  executeSettle: (claimId: number) => Promise<void>;
  executeRedeem: (claimId: number, epoch?: number) => Promise<void>;
}

const PerpetuaContext = createContext<PerpetuaContextValue | null>(null);

export function PerpetuaProvider({ children }: { children: React.ReactNode }) {
  const { accountId, callMethod } = useNear();
  const [mode, setMode] = useState<DataSourceMode>(
    isLiveContractConfigured() ? "live" : "demo"
  );
  const [config, setConfig] = useState<ContractConfigView>(DEFAULT_DEMO_CONFIG);
  const [bundles, setBundles] = useState<ClaimBundle[]>(() => buildSeedBundles());
  const [positions, setPositions] = useState<Record<number, PositionView>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const loadFromServicesOrChain = useCallback(async () => {
    if (mode !== "live") {
      setConfig(DEFAULT_DEMO_CONFIG);
      return;
    }
    setLoading(true);
    setLastError(null);
    try {
      // Try Phase 2 indexer/API service first
      const svcRes = await fetch(`${SERVICES_URL}/api/claims`, {
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);
      if (svcRes && svcRes.ok) {
        const payload = (await svcRes.json()) as {
          bundles?: ClaimBundle[];
          config?: ContractConfigView;
        };
        if (payload.config) setConfig(payload.config);
        if (payload.bundles && payload.bundles.length > 0) {
          setBundles(payload.bundles);
          return;
        }
      }

      if (!isLiveContractConfigured()) {
        setLastError("NEXT_PUBLIC_CONTRACT_ID not configured; switch to Demo Ledger or set .env.local.");
        return;
      }

      const [liveConfig, totalCount] = await Promise.all([
        fetchOnChainConfig(),
        fetchOnChainClaimsCount(),
      ]);
      setConfig(liveConfig);

      const pageSize = 50;
      const claims: ClaimView[] = [];
      for (let offset = 0; offset < totalCount; offset += pageSize) {
        const page = await fetchOnChainClaims(offset, pageSize);
        claims.push(...page);
        if (page.length < pageSize) break;
      }

      if (claims.length === 0) {
        setBundles([]);
        return;
      }

      const loaded = await Promise.all(
        claims.map(async (claim: ClaimView) => {
          const market = await fetchOnChainMarket(claim.id, claim.current_epoch);
          if (!market) return null;
          const article = synthesizeArticleFromMarket(claim, market, null);
          const bundle: ClaimBundle = {
            claim,
            market,
            history: [
              {
                timestampMs: Number(BigInt(market.opened_at) / 1_000_000n),
                yesPriceE6: 500_000,
                eventLabel: `Epoch ${market.epoch} opened`,
              },
              {
                timestampMs: Date.now(),
                yesPriceE6: market.yes_price_e6,
              },
            ],
            article,
            ruling: market.verdict
              ? {
                  claimId: claim.id,
                  epoch: market.epoch,
                  finalVerdict: market.verdict,
                  attestationHash: market.attestation_hash ?? "",
                  modelVotes: [],
                  createdAtMs: Number(BigInt(market.ruled_at ?? "0") / 1_000_000n),
                }
              : null,
          };
          return bundle;
        })
      );
      setBundles(loaded.filter((b): b is ClaimBundle => b !== null));
    } catch (e) {
      setLastError(
        e instanceof Error
          ? `Live fetch failed (${e.message}). Switch to Demo Ledger or verify ${CONTRACT_ID}.`
          : "Live fetch failed"
      );
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadFromServicesOrChain();
  }, [loadFromServicesOrChain]);

  const refreshClaim = useCallback(
    async (claimId: number) => {
      if (mode !== "live") return;
      try {
        const svcRes = await fetch(`${SERVICES_URL}/api/claims/${claimId}`, {
          signal: AbortSignal.timeout(2500),
        }).catch(() => null);
        if (svcRes && svcRes.ok) {
          const payload = (await svcRes.json()) as { bundle?: ClaimBundle };
          if (payload.bundle) {
            setBundles((prev) =>
              prev.map((b) => (b.claim.id === claimId ? payload.bundle! : b))
            );
          }
        }
        if (isLiveContractConfigured() && accountId) {
          const pos = await fetchOnChainPosition(claimId, accountId);
          setPositions((prev) => ({ ...prev, [claimId]: pos }));
        }
      } catch {
        // Ignore transient RPC polling failure
      }
    },
    [mode, accountId]
  );

  const getBundle = useCallback(
    (claimId: number) => bundles.find((b) => b.claim.id === claimId),
    [bundles]
  );

  const executeBuy = useCallback(
    async (claimId: number, outcome: Outcome, amountNear: string) => {
      setLastError(null);
      const target = bundles.find((b) => b.claim.id === claimId);
      if (!target) throw new Error("Claim not found");

      const depositYocto = parseNearToYocto(amountNear);
      if (depositYocto <= 0n) throw new Error("Enter a valid positive NEAR amount");

      const q = quoteBuy(
        BigInt(target.market.yes_reserve),
        BigInt(target.market.no_reserve),
        depositYocto,
        outcome,
        target.market.fee_bps
      );
      if (!q) throw new Error("Trade exceeds reserve floor or invalid quote");

      if (mode === "live" && isLiveContractConfigured()) {
        const minShares = (q.sharesOut * 98n) / 100n;
        await callMethod(
          buildBuyTx({
            claimId,
            outcome,
            minShares: minShares.toString(),
            depositYocto: depositYocto.toString(),
          })
        );
        await loadFromServicesOrChain();
        await refreshClaim(claimId);
        return;
      }

      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId) return b;
          const nextMarket: MarketView = {
            ...b.market,
            yes_reserve: q.newYesReserve.toString(),
            no_reserve: q.newNoReserve.toString(),
            collateral_vault: (BigInt(b.market.collateral_vault) + q.netCollateral).toString(),
            outstanding_yes:
              outcome === "Yes"
                ? (BigInt(b.market.outstanding_yes) + q.sharesOut).toString()
                : b.market.outstanding_yes,
            outstanding_no:
              outcome === "No"
                ? (BigInt(b.market.outstanding_no) + q.sharesOut).toString()
                : b.market.outstanding_no,
            fee_pool: (BigInt(b.market.fee_pool) + q.fee).toString(),
            yes_price_e6: q.postYesPriceE6,
            no_price_e6: q.postNoPriceE6,
          };
          const nextArticle = synthesizeArticleFromMarket(b.claim, nextMarket, b.ruling);
          const nextClaim: ClaimView = {
            ...b.claim,
            page_hash: nextArticle.pageHash,
            page_hash_updated_at: (BigInt(Date.now()) * 1_000_000n).toString(),
          };
          return {
            ...b,
            claim: nextClaim,
            market: nextMarket,
            article: nextArticle,
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: q.postYesPriceE6,
                trader: accountId || "demo-trader.testnet",
                eventLabel: `Bought ${outcome} (${amountNear} NEAR)`,
              },
            ],
          };
        })
      );

      setPositions((prev) => {
        const cur = prev[claimId] ?? {
          claim_id: claimId,
          epoch: target.market.epoch,
          account_id: accountId || "demo-trader.testnet",
          yes_shares: "0",
          no_shares: "0",
        };
        return {
          ...prev,
          [claimId]: {
            ...cur,
            yes_shares:
              outcome === "Yes"
                ? (BigInt(cur.yes_shares) + q.sharesOut).toString()
                : cur.yes_shares,
            no_shares:
              outcome === "No"
                ? (BigInt(cur.no_shares) + q.sharesOut).toString()
                : cur.no_shares,
          },
        };
      });
    },
    [bundles, mode, callMethod, loadFromServicesOrChain, refreshClaim, accountId]
  );

  const executeSell = useCallback(
    async (claimId: number, outcome: Outcome, sharesYocto: string) => {
      setLastError(null);
      const target = bundles.find((b) => b.claim.id === claimId);
      if (!target) throw new Error("Claim not found");
      const shares = BigInt(sharesYocto);
      if (shares <= 0n) throw new Error("Shares must be positive");

      const q = quoteSell(
        BigInt(target.market.yes_reserve),
        BigInt(target.market.no_reserve),
        shares,
        outcome,
        target.market.fee_bps
      );
      if (!q) throw new Error("Sell quote exceeds pool limits");

      if (mode === "live" && isLiveContractConfigured()) {
        const minOut = (q.netCollateral * 98n) / 100n;
        await callMethod(
          buildSellTx({
            claimId,
            outcome,
            shares: shares.toString(),
            minCollateralOut: minOut.toString(),
          })
        );
        await loadFromServicesOrChain();
        await refreshClaim(claimId);
        return;
      }

      const pos = positions[claimId];
      if (!pos) throw new Error("No demo shares held to sell");
      const avail = outcome === "Yes" ? BigInt(pos.yes_shares) : BigInt(pos.no_shares);
      if (avail < shares) throw new Error("Insufficient demo shares");

      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId) return b;
          const nextMarket: MarketView = {
            ...b.market,
            yes_reserve: q.newYesReserve.toString(),
            no_reserve: q.newNoReserve.toString(),
            collateral_vault: (
              BigInt(b.market.collateral_vault) - q.grossCollateral
            ).toString(),
            outstanding_yes:
              outcome === "Yes"
                ? (BigInt(b.market.outstanding_yes) - shares).toString()
                : b.market.outstanding_yes,
            outstanding_no:
              outcome === "No"
                ? (BigInt(b.market.outstanding_no) - shares).toString()
                : b.market.outstanding_no,
            fee_pool: (BigInt(b.market.fee_pool) + q.fee).toString(),
            yes_price_e6: q.postYesPriceE6,
            no_price_e6: q.postNoPriceE6,
          };
          const nextArticle = synthesizeArticleFromMarket(b.claim, nextMarket, b.ruling);
          return {
            ...b,
            claim: { ...b.claim, page_hash: nextArticle.pageHash },
            market: nextMarket,
            article: nextArticle,
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: q.postYesPriceE6,
                trader: accountId || "demo-trader.testnet",
                eventLabel: `Sold ${outcome}`,
              },
            ],
          };
        })
      );

      setPositions((prev) => {
        const cur = prev[claimId]!;
        return {
          ...prev,
          [claimId]: {
            ...cur,
            yes_shares:
              outcome === "Yes" ? (BigInt(cur.yes_shares) - shares).toString() : cur.yes_shares,
            no_shares:
              outcome === "No" ? (BigInt(cur.no_shares) - shares).toString() : cur.no_shares,
          },
        };
      });
    },
    [bundles, mode, callMethod, loadFromServicesOrChain, refreshClaim, positions, accountId]
  );

  const executeEscalate = useCallback(
    async (claimId: number, assertedOutcome?: Outcome) => {
      setLastError(null);
      const bond = BigInt(config.escalation_bond);
      const bondWithStorage = (bond + ESCALATE_STORAGE_BUFFER_YOCTO).toString();
      if (mode === "live" && isLiveContractConfigured()) {
        await callMethod(
          buildEscalateTx({
            claimId,
            assertedOutcome,
            bondYocto: bondWithStorage,
          })
        );
        await loadFromServicesOrChain();
        await refreshClaim(claimId);
        return;
      }

      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId) return b;
          const side: Outcome =
            assertedOutcome ?? (b.market.yes_price_e6 >= 500_000 ? "No" : "Yes");
          const nextMarket: MarketView = {
            ...b.market,
            status: "Escalated",
            challenger: accountId || "challenger.testnet",
            challenger_side: side,
            challenger_bond: config.escalation_bond,
            escalated_at: (BigInt(Date.now()) * 1_000_000n).toString(),
            snap_yes_price_e6: b.market.yes_price_e6,
          };
          const nextClaim: ClaimView = { ...b.claim, status: "Escalated" };
          return {
            ...b,
            claim: nextClaim,
            market: nextMarket,
            article: synthesizeArticleFromMarket(nextClaim, nextMarket, b.ruling),
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: b.market.yes_price_e6,
                eventLabel: `Escalated (asserted ${side})`,
              },
            ],
          };
        })
      );
    },
    [config.escalation_bond, mode, callMethod, loadFromServicesOrChain, refreshClaim, accountId]
  );

  const executeChallengeRuling = useCallback(
    async (claimId: number, assertedOutcome?: Outcome) => {
      setLastError(null);
      const minCounterBond = BigInt(config.escalation_bond) * 2n;
      const bondWithStorage = (minCounterBond + ESCALATE_STORAGE_BUFFER_YOCTO).toString();
      if (mode === "live" && isLiveContractConfigured()) {
        await callMethod(
          buildChallengeRulingTx({
            claimId,
            assertedOutcome,
            bondYocto: bondWithStorage,
          })
        );
        await loadFromServicesOrChain();
        await refreshClaim(claimId);
        return;
      }

      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId || b.market.status !== "Ruled") return b;
          const fallbackSide: Outcome =
            b.market.verdict === "True" ? "No" : "Yes";
          const side = assertedOutcome ?? fallbackSide;
          const nextMarket: MarketView = {
            ...b.market,
            status: "Escalated",
            counter_challenger: accountId || "counter-challenger.testnet",
            counter_side: side,
            counter_bond: minCounterBond.toString(),
            verdict: null,
            attestation_hash: null,
            ruled_at: null,
            challenge_deadline: null,
          };
          const nextClaim: ClaimView = { ...b.claim, status: "Escalated" };
          return {
            ...b,
            claim: nextClaim,
            market: nextMarket,
            article: synthesizeArticleFromMarket(nextClaim, nextMarket, null),
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: b.market.yes_price_e6,
                eventLabel: `Counter-challenged (${side})`,
              },
            ],
          };
        })
      );
    },
    [config.escalation_bond, mode, callMethod, loadFromServicesOrChain, refreshClaim, accountId]
  );

  const runDemoJuryFlow = useCallback(
    (claimId: number, verdict: Verdict) => {
      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId) return b;
          const models = [
            "deepseek-ai/DeepSeek-V4.1-Flash-1017",
            "Qwen/Qwen3.8-27B",
            "z-ai/glm-5.3-flash",
          ];
          const ruling: JuryRulingRecord = {
            claimId,
            epoch: b.market.epoch,
            finalVerdict: verdict,
            attestationHash: `demo_simulated_att_${claimId}_${b.market.epoch}_${verdict.toLowerCase()}`,
            createdAtMs: Date.now(),
            modelVotes: models.map((model, idx) => ({
              model,
              verdict,
              confidence: verdict === "Unresolved" ? 0.51 : 0.89 - idx * 0.03,
              rationale:
                verdict === "True"
                  ? "Demo jury simulation: cited repositories corroborate the claim."
                  : verdict === "False"
                  ? "Demo jury simulation: evidence contradicts the assertion."
                  : "Demo jury simulation: sources conflict; supermajority unresolved.",
              signatureKind: "provider_tee",
              signingAddress: "demo-simulated-tee",
            })),
          };
          const deadlineNs = (
            BigInt(Date.now()) * 1_000_000n +
            BigInt(config.challenge_window_ns)
          ).toString();
          const nextMarket: MarketView = {
            ...b.market,
            status: "Ruled",
            verdict,
            attestation_hash: ruling.attestationHash,
            ruled_at: (BigInt(Date.now()) * 1_000_000n).toString(),
            challenge_deadline: deadlineNs,
          };
          const nextClaim: ClaimView = { ...b.claim, status: "Ruled" };
          return {
            ...b,
            claim: nextClaim,
            market: nextMarket,
            ruling,
            article: synthesizeArticleFromMarket(nextClaim, nextMarket, ruling),
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: b.market.yes_price_e6,
                eventLabel: `AI Jury ruled ${verdict}`,
              },
            ],
          };
        })
      );
    },
    [config.challenge_window_ns]
  );

  const fastForwardDemoChallengeWindow = useCallback((claimId: number) => {
    setBundles((prev) =>
      prev.map((b) => {
        if (b.claim.id !== claimId || b.market.status !== "Ruled") return b;
        return {
          ...b,
          market: {
            ...b.market,
            challenge_deadline: (BigInt(Date.now() - 1000) * 1_000_000n).toString(),
          },
        };
      })
    );
  }, []);

  const executeSettle = useCallback(
    async (claimId: number) => {
      if (mode === "live" && isLiveContractConfigured()) {
        await callMethod(buildSettleTx(claimId));
        await loadFromServicesOrChain();
        await refreshClaim(claimId);
        return;
      }

      setBundles((prev) =>
        prev.map((b) => {
          if (b.claim.id !== claimId) return b;
          const m = b.market;
          const vault = BigInt(m.collateral_vault);
          const outYes = BigInt(m.outstanding_yes);
          const outNo = BigInt(m.outstanding_no);
          const feePool = BigInt(m.fee_pool);

          let liability = 0n;
          if (m.verdict === "True") {
            liability = outYes;
          } else if (m.verdict === "False") {
            liability = outNo;
          } else {
            const pYes = BigInt(m.snap_yes_price_e6 ?? m.yes_price_e6);
            const pNo = PRICE_SCALE - pYes;
            liability = (outYes * pYes) / PRICE_SCALE + (outNo * pNo) / PRICE_SCALE;
          }

          const challengerWon =
            (m.verdict === "True" && m.challenger_side === "Yes") ||
            (m.verdict === "False" && m.challenger_side === "No");
          const reward = challengerWon ? (feePool * 5000n) / 10000n : 0n;
          const retainedVault = vault > liability ? vault - liability : 0n;
          const nextSeed = retainedVault + (feePool - reward);
          const seedReserve = (nextSeed > 0n ? nextSeed : YOCTO_PER_NEAR).toString();

          const nextEpoch = m.epoch + 1;
          const nextMarket: MarketView = {
            ...m,
            epoch: nextEpoch,
            yes_reserve: seedReserve,
            no_reserve: seedReserve,
            collateral_vault: seedReserve,
            outstanding_yes: "0",
            outstanding_no: "0",
            fee_pool: "0",
            yes_price_e6: 500_000,
            no_price_e6: 500_000,
            status: "Open",
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
            retained_liquidity: seedReserve,
          };
          const nextClaim: ClaimView = {
            ...b.claim,
            current_epoch: nextEpoch,
            status: "Open",
          };
          return {
            ...b,
            claim: nextClaim,
            market: nextMarket,
            ruling: b.ruling,
            article: synthesizeArticleFromMarket(nextClaim, nextMarket, b.ruling),
            history: [
              ...b.history,
              {
                timestampMs: Date.now(),
                yesPriceE6: 500_000,
                eventLabel: `Settled -> Epoch ${nextEpoch} opened`,
              },
            ],
          };
        })
      );
    },
    [mode, callMethod, loadFromServicesOrChain, refreshClaim]
  );

  const executeRedeem = useCallback(
    async (claimId: number, epoch?: number) => {
      if (mode === "live" && isLiveContractConfigured()) {
        await callMethod(buildRedeemTx(claimId, epoch));
        await refreshClaim(claimId);
        return;
      }
      setPositions((prev) => {
        const next = { ...prev };
        delete next[claimId];
        return next;
      });
    },
    [mode, callMethod, refreshClaim]
  );

  const executeCreateClaim = useCallback(
    async (input: {
      text: string;
      evidenceUris: string[];
      category: string;
      epochHours: number;
      seedNear: string;
    }) => {
      const seedYocto = parseNearToYocto(input.seedNear);
      if (seedYocto <= 0n) throw new Error("Enter a valid positive seed NEAR amount");
      const epochLengthNs = (BigInt(Math.max(1, input.epochHours)) * 3600n * 1_000_000_000n).toString();

      if (mode === "live" && isLiveContractConfigured()) {
        await callMethod(
          buildCreateClaimTx({
            text: input.text,
            evidenceUris: input.evidenceUris,
            category: input.category,
            epochLengthNs,
            depositYocto: seedYocto.toString(),
          })
        );
        await loadFromServicesOrChain();
        return await fetchOnChainClaimsCount().catch(() => bundles.length + 1);
      }

      const nextId = bundles.reduce((m, b) => Math.max(m, b.claim.id), 0) + 1;
      const nowNs = (BigInt(Date.now()) * 1_000_000n).toString();
      const claim: ClaimView = {
        id: nextId,
        creator: accountId || "creator.testnet",
        text: input.text,
        text_hash: `demo_${nextId}`,
        evidence_uris: input.evidenceUris,
        category: input.category,
        epoch_length: epochLengthNs,
        current_epoch: 1,
        status: "Open",
        page_hash: null,
        page_hash_updated_at: null,
        created_at: nowNs,
      };
      const market: MarketView = {
        claim_id: nextId,
        epoch: 1,
        yes_reserve: seedYocto.toString(),
        no_reserve: seedYocto.toString(),
        collateral_vault: seedYocto.toString(),
        outstanding_yes: "0",
        outstanding_no: "0",
        fee_pool: "0",
        fee_bps: config.fee_bps,
        opened_at: nowNs,
        epoch_end: (BigInt(nowNs) + BigInt(epochLengthNs)).toString(),
        status: "Open",
        yes_price_e6: 500_000,
        no_price_e6: 500_000,
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
      const article = synthesizeArticleFromMarket(claim, market, null);
      claim.page_hash = article.pageHash;
      const newBundle: ClaimBundle = {
        claim,
        market,
        history: [{ timestampMs: Date.now(), yesPriceE6: 500_000, eventLabel: "Epoch 1 seeded" }],
        article,
        ruling: null,
      };
      setBundles((prev) => [newBundle, ...prev]);
      return nextId;
    },
    [mode, callMethod, loadFromServicesOrChain, bundles, accountId, config.fee_bps]
  );

  return (
    <PerpetuaContext.Provider
      value={{
        mode,
        setMode,
        config,
        bundles,
        positions,
        loading,
        lastError,
        getBundle,
        refreshAll: loadFromServicesOrChain,
        refreshClaim,
        executeBuy,
        executeSell,
        executeEscalate,
        executeChallengeRuling,
        executeCreateClaim,
        runDemoJuryFlow,
        fastForwardDemoChallengeWindow,
        executeSettle,
        executeRedeem,
      }}
    >
      {children}
    </PerpetuaContext.Provider>
  );
}

export function usePerpetua() {
  const ctx = useContext(PerpetuaContext);
  if (!ctx) throw new Error("usePerpetua must be used inside PerpetuaProvider");
  return ctx;
}
