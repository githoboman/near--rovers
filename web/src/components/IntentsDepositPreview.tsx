"use client";

import React, { useState } from "react";
import { ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react";
import { SERVICES_URL } from "@/lib/near";
import { useNear } from "@/providers/NearProvider";

interface TokenItem {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
}

const DEFAULT_TOKENS: TokenItem[] = [
  { assetId: "nep141:eth.omft.near", decimals: 18, blockchain: "eth", symbol: "ETH" },
  { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, blockchain: "base", symbol: "USDC (Base)" },
  { assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", decimals: 6, blockchain: "arb", symbol: "USDC (Arbitrum)" },
  { assetId: "nep141:sol.omft.near", decimals: 9, blockchain: "sol", symbol: "SOL" },
];

export function IntentsDepositPreview() {
  const { accountId } = useNear();
  const [expanded, setExpanded] = useState(false);
  const [tokens, setTokens] = useState<TokenItem[]>(DEFAULT_TOKENS);
  const [originAsset, setOriginAsset] = useState(DEFAULT_TOKENS[0].assetId);
  const [amountInput, setAmountInput] = useState("0.01");
  const [refundTo, setRefundTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = tokens.find((t) => t.assetId === originAsset) ?? tokens[0];

  const loadLiveTokens = async () => {
    try {
      const res = await fetch(`${SERVICES_URL}/api/intents/tokens`, {
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tokens?: TokenItem[];
        testnetNotice?: string | null;
      };
      if (data.testnetNotice) setNotice(data.testnetNotice);
      if (Array.isArray(data.tokens) && data.tokens.length > 0) {
        const filtered = data.tokens.filter((t) => t.assetId !== "nep141:wrap.near").slice(0, 24);
        if (filtered.length > 0) {
          setTokens(filtered);
          setOriginAsset(filtered[0].assetId);
        }
      }
    } catch {
      // Keep default curated origin asset presets when /services is offline.
    }
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      void loadLiveTokens();
    }
  };

  const toSmallestUnit = (val: string, decimals: number): string => {
    const cleaned = val.trim();
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return "0";
    const [whole, frac = ""] = cleaned.split(".");
    const padded = frac.slice(0, decimals).padEnd(decimals, "0");
    return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded)).toString();
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setQuoteOut(null);
    try {
      const baseAmount = toSmallestUnit(amountInput, selectedToken.decimals);
      if (baseAmount === "0") {
        throw new Error("Enter a positive origin token amount");
      }
      const res = await fetch(`${SERVICES_URL}/api/intents/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originAsset,
          destinationAsset: "nep141:wrap.near",
          amount: baseAmount,
          recipient: accountId || "perpetua-demo.near",
          refundTo: refundTo.trim() || "0x0000000000000000000000000000000000000000",
          slippageTolerance: 100,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        testnetNotice?: string | null;
        quote?: { quote?: { amountOut?: string; amountOutFormatted?: string; timeEstimate?: number } };
      };
      if (!res.ok) {
        throw new Error(data.error || `Quote failed (${res.status})`);
      }
      if (data.testnetNotice) setNotice(data.testnetNotice);
      const q = data.quote?.quote;
      const outDisplay =
        q?.amountOutFormatted ??
        (q?.amountOut
          ? `${(Number(BigInt(q.amountOut) / 10n ** 18n) / 1e6).toFixed(4)} wNEAR`
          : "Dry-run quote succeeded");
      setQuoteOut(
        `Est. receive: ${outDisplay}${q?.timeEstimate ? ` · ~${q.timeEstimate}s` : ""}`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not reach ${SERVICES_URL}/api/intents/quote`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel" style={{ padding: 20 }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: "var(--ink)",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ArrowRightLeft size={15} color="var(--muted)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Cross-Chain Funding Quote (NEAR Intents 1Click · Phase 4 Preview)
          </span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <form
          onSubmit={handlePreview}
          style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {notice ||
              "NEAR Intents 1Click runs on mainnet only; quotes from this UI always enforce dry=true preview mode."}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                htmlFor="intents-asset"
                style={{ display: "block", fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}
              >
                Origin Asset
              </label>
              <select
                id="intents-asset"
                className="field-input"
                value={originAsset}
                onChange={(e) => setOriginAsset(e.target.value)}
              >
                {tokens.map((t) => (
                  <option key={t.assetId} value={t.assetId}>
                    {t.symbol} ({t.blockchain})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="intents-amount"
                style={{ display: "block", fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}
              >
                Amount ({selectedToken.symbol})
              </label>
              <input
                id="intents-amount"
                type="text"
                className="field-input tabular"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="intents-refund"
              style={{ display: "block", fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}
            >
              Origin Refund Address (optional for dry quote)
            </label>
            <input
              id="intents-refund"
              type="text"
              className="field-input tabular"
              placeholder="0x... or Solana address"
              value={refundTo}
              onChange={(e) => setRefundTo(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span className="pill" style={{ fontSize: 11.5, color: "var(--muted)" }}>
              Destination: wNEAR · dry=true
            </span>
            <button type="submit" className="btn btn-sm" disabled={loading}>
              {loading ? "Quoting..." : "Preview 1Click Quote"}
            </button>
          </div>

          {quoteOut && (
            <p className="tabular" style={{ fontSize: 12.5, color: "var(--yes)", fontWeight: 500 }}>
              {quoteOut}
            </p>
          )}
          {error && <p style={{ fontSize: 12.5, color: "var(--no)" }}>{error}</p>}
        </form>
      )}
    </section>
  );
}

