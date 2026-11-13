"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPct } from "@/lib/amm";
import { confidenceBand } from "@/lib/seedClaims";
import { MarketView, PricePoint } from "@/lib/types";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface Props {
  market: MarketView;
  history: PricePoint[];
}

const BAND_LABEL = { high: "Supported", contested: "Contested", low: "Disputed" } as const;

/** Live YES / NO probability with animated value, split bar and change flash. */
export function ProbabilityReadout({ market, history }: Props) {
  const yes = useAnimatedNumber(market.yes_price_e6, 800);
  const no = useAnimatedNumber(market.no_price_e6, 800);
  const band = confidenceBand(market.yes_price_e6);
  const color = band === "high" ? "var(--yes)" : band === "low" ? "var(--no)" : "var(--contested)";

  // Flash on change
  const prev = useRef(market.yes_price_e6);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");
  useEffect(() => {
    if (prev.current === market.yes_price_e6) return;
    setFlash(market.yes_price_e6 > prev.current ? "flash-up" : "flash-down");
    prev.current = market.yes_price_e6;
    const id = setTimeout(() => setFlash(""), 1200);
    return () => clearTimeout(id);
  }, [market.yes_price_e6]);

  // Change vs. the previous recorded price point
  const last = history.length >= 2 ? history[history.length - 1] : null;
  const before = history.length >= 2 ? history[history.length - 2] : null;
  const deltaPts = last && before ? (last.yesPriceE6 - before.yesPriceE6) / 10_000 : null;

  const yesPct = Math.max(0, Math.min(100, yes / 10_000));

  return (
    <section id="market-panel" className={`panel ${flash}`} style={{ padding: "18px 20px" }} aria-label="Live market probability">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Implied probability</span>
        <span className={`pill ${band === "high" ? "pill-yes" : band === "low" ? "pill-no" : "pill-contested"}`}>
          {BAND_LABEL[band]}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14 }}>
        <span
          className="serif tabular"
          style={{ fontSize: 56, lineHeight: 1, letterSpacing: "-0.03em", color }}
          aria-live="polite"
        >
          {formatPct(yes, 1)}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>YES</span>
        {deltaPts !== null && deltaPts !== 0 && (
          <span
            className="tabular"
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: 12,
              color: deltaPts > 0 ? "var(--yes)" : "var(--no)",
            }}
            title="Change from the previous recorded price"
          >
            {deltaPts > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(deltaPts).toFixed(1)} pts
          </span>
        )}
      </div>

      {/* Split bar */}
      <div
        style={{ display: "flex", height: 6, marginTop: 18, borderRadius: 2, overflow: "hidden", background: "var(--border)" }}
        role="img"
        aria-label={`YES ${formatPct(market.yes_price_e6, 1)}, NO ${formatPct(market.no_price_e6, 1)}`}
      >
        <div className="prob-fill" style={{ width: `${yesPct}%`, background: "var(--yes)" }} />
        <div className="prob-fill" style={{ flex: 1, background: "var(--no)", opacity: 0.75 }} />
      </div>
      <div className="tabular" style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
        <span style={{ color: "var(--yes)" }}>YES {formatPct(yes, 1)}</span>
        <span style={{ color: "var(--no)" }}>NO {formatPct(no, 1)}</span>
      </div>
    </section>
  );
}
