"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import {
  formatNear,
  formatPct,
  parseNearToYocto,
  quoteBuy,
  quoteSell,
} from "@/lib/amm";
import { MarketView, Outcome, PositionView } from "@/lib/types";
import { usePerpetua } from "@/providers/PerpetuaStore";

interface TradeWidgetProps {
  claimId: number;
  market: MarketView;
  position?: PositionView;
}

export function TradeWidget({ claimId, market, position }: TradeWidgetProps) {
  const { mode, executeBuy, executeSell } = usePerpetua();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [outcome, setOutcome] = useState<Outcome>("Yes");
  const [amountInput, setAmountInput] = useState<string>("0.5");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isOpen = market.status === "Open";

  const preview = useMemo(() => {
    const yesRes = BigInt(market.yes_reserve);
    const noRes = BigInt(market.no_reserve);
    const rawAmount = parseNearToYocto(amountInput);
    if (rawAmount <= 0n) return null;
    if (action === "buy") {
      return { kind: "buy" as const, quote: quoteBuy(yesRes, noRes, rawAmount, outcome, market.fee_bps) };
    }
    return { kind: "sell" as const, quote: quoteSell(yesRes, noRes, rawAmount, outcome, market.fee_bps) };
  }, [action, outcome, amountInput, market]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      if (action === "buy") {
        await executeBuy(claimId, outcome, amountInput);
        setFeedback(`Bought ${outcome} position.`);
      } else {
        const sharesYocto = parseNearToYocto(amountInput).toString();
        await executeSell(claimId, outcome, sharesYocto);
        setFeedback(`Sold ${outcome} shares.`);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runDemoMove = async (targetOutcome: Outcome, nearSize: string) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      await executeBuy(claimId, targetOutcome, nearSize);
      setFeedback(`Demo trade moved price -> article rewritten.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Demo move failed");
    } finally {
      setSubmitting(false);
    }
  };

  const heldYes = position ? formatNear(position.yes_shares, 3) : "0.000";
  const heldNo = position ? formatNear(position.no_shares, 3) : "0.000";

  return (
    <section className="panel" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Trade Confidence</h2>
        <span className="tabular" style={{ fontSize: 12, color: "var(--muted)" }}>
          Fee {(market.fee_bps / 100).toFixed(1)}%
        </span>
      </div>

      {/* Buy / Sell switch */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: 4,
          background: "var(--surface-muted)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        {(["buy", "sell"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setAction(tab)}
            style={{
              height: 30,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              background: action === tab ? "var(--surface)" : "transparent",
              color: action === tab ? "var(--ink)" : "var(--muted)",
              boxShadow: action === tab ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {tab === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* YES / NO outcome selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setOutcome("Yes")}
          className="btn"
          style={{
            justifyContent: "space-between",
            borderColor: outcome === "Yes" ? "var(--yes)" : "var(--border)",
            background: outcome === "Yes" ? "var(--yes-bg)" : "var(--surface)",
            color: outcome === "Yes" ? "var(--yes)" : "var(--ink)",
          }}
        >
          <span>YES</span>
          <span className="tabular">{formatPct(market.yes_price_e6, 1)}</span>
        </button>

        <button
          type="button"
          onClick={() => setOutcome("No")}
          className="btn"
          style={{
            justifyContent: "space-between",
            borderColor: outcome === "No" ? "var(--no)" : "var(--border)",
            background: outcome === "No" ? "var(--no-bg)" : "var(--surface)",
            color: outcome === "No" ? "var(--no)" : "var(--ink)",
          }}
        >
          <span>NO</span>
          <span className="tabular">{formatPct(market.no_price_e6, 1)}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label
            htmlFor="trade-amount"
            style={{ display: "block", fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}
          >
            {action === "buy" ? "Collateral (NEAR)" : `${outcome} Shares (1e24 units)`}
          </label>
          <input
            id="trade-amount"
            type="text"
            className="field-input tabular"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.5"
            disabled={!isOpen || submitting}
          />
        </div>

        {preview?.quote && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 7,
              background: "var(--surface-muted)",
              fontSize: 12.5,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>
                {preview.kind === "buy" ? "Est. shares out" : "Est. NEAR out"}
              </span>
              <span className="tabular" style={{ fontWeight: 600 }}>
                {preview.kind === "buy"
                  ? `${formatNear(preview.quote.sharesOut, 4)} sh`
                  : `${formatNear(preview.quote.netCollateral, 4)} Ⓝ`}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Post-trade YES confidence</span>
              <span className="tabular" style={{ fontWeight: 600 }}>
                {formatPct(market.yes_price_e6, 1)}{" "}
                <ArrowRight size={11} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {formatPct(preview.quote.postYesPriceE6, 1)}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!isOpen || submitting || !preview?.quote}
          className={`btn ${outcome === "Yes" ? "btn-yes" : "btn-no"}`}
          style={{ width: "100%" }}
        >
          {!isOpen
            ? `Trading frozen (${market.status})`
            : submitting
            ? "Submitting..."
            : `${action === "buy" ? "Buy" : "Sell"} ${outcome}`}
        </button>
      </form>

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span>Your epoch #{market.epoch} position</span>
        <span className="tabular">
          {heldYes} YES · {heldNo} NO
        </span>
      </div>

      {mode === "demo" && isOpen && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            <Play size={12} />
            <span>Demo Script: Move Price & Rewrite Article</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={submitting}
              onClick={() => void runDemoMove("Yes", "5")}
            >
              +5 Ⓝ YES ↑
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={submitting}
              onClick={() => void runDemoMove("No", "5")}
            >
              +5 Ⓝ NO ↓
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>{feedback}</p>
      )}
    </section>
  );
}

