"use client";

import React from "react";
import { formatNear, formatPct } from "@/lib/amm";
import { NETWORK_LABEL } from "@/lib/near";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { usePerpetua } from "@/providers/PerpetuaStore";
import { Reveal } from "@/components/Reveal";

function Count({ value }: { value: number }) {
  const v = useAnimatedNumber(value, 900);
  return <>{Math.round(v)}</>;
}

function Pct({ e6 }: { e6: number }) {
  const v = useAnimatedNumber(e6, 900);
  return <>{formatPct(v, 1)}</>;
}

export function ProtocolOverview() {
  const { bundles, mode, loading } = usePerpetua();
  const stats = useProtocolStats(bundles);
  const pending = loading && stats.totalClaims === 0;

  const items = [
    {
      label: "Tracked claims",
      value: <Count value={stats.totalClaims} />,
      note: `${stats.openClaims} open · ${stats.settledClaims} settled`,
    },
    {
      label: "Active disputes",
      value: <Count value={stats.activeDisputes} />,
      note: "Escalated to the AI jury or inside a challenge window",
    },
    {
      label: "Pooled collateral",
      value: (
        <>
          {formatNear(stats.totalVault, 2)}
          <span style={{ fontSize: "0.4em", color: "var(--muted)", marginLeft: 8 }}>Ⓝ</span>
        </>
      ),
      note: "Held across all market collateral vaults",
    },
    {
      label: "Average confidence",
      value: stats.avgYes === null ? "—" : <Pct e6={stats.avgYes} />,
      note: "Mean YES price across tracked claims",
    },
  ];

  return (
    <section id="overview" className="l-section" aria-labelledby="overview-title">
      <div className="l-wrap">
        <div className="l-grid" style={{ alignItems: "end", marginBottom: 56 }}>
          <Reveal>
            <p className="eyebrow">Protocol overview</p>
            <h2 id="overview-title" className="l-heading" style={{ marginTop: 18 }}>
              The registry, as it stands.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="l-lede" style={{ marginTop: 0, maxWidth: 520 }}>
              {mode === "demo"
                ? "Figures below are computed from the seeded Demo Ledger: sample claims with a simulated market maker, so you can explore the full flow without spending anything."
                : `Figures below are read live from the Perpetua contract on NEAR ${NETWORK_LABEL}.`}
            </p>
          </Reveal>
        </div>

        <Reveal line>
          <div style={{ height: 1, background: "var(--border-strong)" }} />
        </Reveal>

        <div className="overview-row" style={{ borderTop: "none" }}>
          {items.map((it, i) => (
            <Reveal key={it.label} delay={i * 90} className="overview-item">
              <div className="eyebrow">{it.label}</div>
              {pending ? (
                <div className="skeleton" style={{ height: 56, marginTop: 14, width: "70%" }} aria-label="Loading" />
              ) : (
                <div className="overview-value">{it.value}</div>
              )}
              <p className="overview-note">{it.note}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
