"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Play, Zap } from "lucide-react";
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

const QUICK_AMOUNTS = ["0.1", "0.5", "1.0", "5.0"];

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
        setFeedback(`Success: Bought ${outcome} position.`);
      } else {
        const sharesYocto = parseNearToYocto(amountInput).toString();
        await executeSell(claimId, outcome, sharesYocto);
        setFeedback(`Success: Sold ${outcome} shares.`);
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
      setFeedback(`Price moved: Executed ${nearSize} Ⓝ ${targetOutcome} trade.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Demo move failed");
    } finally {
      setSubmitting(false);
    }
  };

  const heldYes = position ? formatNear(position.yes_shares, 3) : "0.000";
  const heldNo = position ? formatNear(position.no_shares, 3) : "0.000";

  return (
    <section className="panel" style={{ padding: "18px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Trade Market</h2>
        <span className="tabular" style={{ fontSize: 11.5, color: "var(--muted)" }}>
          CPMM Fee {(market.fee_bps / 100).toFixed(1)}%
        </span>
      </div>

      {/* Segmented Buy / Sell switch */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: 3,
          background: "var(--surface-muted)",
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        {(["buy", "sell"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setAction(tab)}
            style={{
              height: 28,
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: action === tab ? 600 : 400,
              background: action === tab ? "var(--surface-hover)" : "transparent",
              color: action === tab ? "var(--ink)" : "var(--muted)",
            }}
          >
            {tab === "buy" ? "Buy Position" : "Sell Shares"}
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
            background: outcome === "Yes" ? "var(--yes-bg)" : "var(--surface-muted)",
            color: outcome === "Yes" ? "var(--yes)" : "var(--ink)",
            fontWeight: outcome === "Yes" ? 600 : 500,
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
            background: outcome === "No" ? "var(--no-bg)" : "var(--surface-muted)",
            color: outcome === "No" ? "var(--no)" : "var(--ink)",
            fontWeight: outcome === "No" ? 600 : 500,
          }}
        >
          <span>NO</span>
          <span className="tabular">{formatPct(market.no_price_e6, 1)}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <label
              htmlFor="trade-amount"
              style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}
            >
              {action === "buy" ? "Collateral Deposit (NEAR)" : `${outcome} Shares to Redeem`}
            </label>
            <span className="tabular" style={{ fontSize: 11.5, color: "var(--muted-light)" }}>
              Bal: {action === "buy" ? "NEAR native" : outcome === "Yes" ? heldYes : heldNo}
            </span>
          </div>

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

        {/* Quick Amount Chips */}
        {action === "buy" && (
          <div style={{ display: "flex", gap: 6 }}>
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                className="btn btn-sm"
                style={{ flex: 1, height: 26, fontSize: 11.5 }}
                onClick={() => setAmountInput(amt)}
                disabled={!isOpen || submitting}
              >
                +{amt}Ⓝ
              </button>
            ))}
          </div>
        )}

        {/* Execution Preview */}
        {preview?.quote && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>
                {preview.kind === "buy" ? "Expected Shares Received" : "Expected Collateral Returned"}
              </span>
              <span className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {preview.kind === "buy"
                  ? `${formatNear(preview.quote.sharesOut, 3)} sh`
                  : `${formatNear(preview.quote.netCollateral, 4)} Ⓝ`}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Post-Trade Confidence</span>
              <span className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {formatPct(market.yes_price_e6, 1)}{" "}
                <ArrowRight size={11} style={{ display: "inline", verticalAlign: "middle", margin: "0 2px" }} />{" "}
                <span style={{ color: preview.quote.postYesPriceE6 >= market.yes_price_e6 ? "var(--yes)" : "var(--no)" }}>
                  {formatPct(preview.quote.postYesPriceE6, 1)}
                </span>
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!isOpen || submitting || !preview?.quote}
          className={`btn ${outcome === "Yes" ? "btn-yes" : "btn-no"}`}
          style={{ width: "100%", height: 38, marginTop: 4 }}
        >
          <Zap size={14} />
          <span>
            {!isOpen
              ? `Trading Closed (${market.status})`
              : submitting
              ? "Executing on NEAR..."
              : `${action === "buy" ? "Buy" : "Sell"} ${outcome}`}
          </span>
        </button>
      </form>

      {/* Position Summary */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11.5,
          color: "var(--muted)",
        }}
      >
        <span>Your Epoch #{market.epoch} Balance</span>
        <span className="tabular" style={{ color: "var(--ink)", fontWeight: 500 }}>
          {heldYes} YES · {heldNo} NO
        </span>
      </div>

      {/* Demo Mover Script in Demo Mode */}
      {mode === "demo" && isOpen && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 600,
              marginBottom: 8,
              color: "var(--muted)",
            }}
          >
            <Play size={12} color="var(--accent)" />
            <span>Simulate Trade (Rewrites Article)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={submitting}
              onClick={() => void runDemoMove("Yes", "5")}
              style={{ color: "var(--yes)", borderColor: "var(--yes-border)" }}
            >
              +5 Ⓝ YES ↑
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={submitting}
              onClick={() => void runDemoMove("No", "5")}
              style={{ color: "var(--no)", borderColor: "var(--no-border)" }}
            >
              +5 Ⓝ NO ↓
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: feedback.startsWith("Success") ? "var(--yes)" : "var(--muted)",
          }}
        >
          {feedback}
        </p>
      )}
    </section>
  );
}
