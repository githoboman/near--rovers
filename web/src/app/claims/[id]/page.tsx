"use client";

import React, { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Link2, Coins } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { confidenceBand } from "@/lib/seedClaims";
import { ConfidenceArticle } from "@/components/ConfidenceArticle";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { TradeWidget } from "@/components/TradeWidget";
import { EscalatePanel } from "@/components/EscalatePanel";
import { usePerpetua } from "@/providers/PerpetuaStore";

export default function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const claimId = Number(id);
  const { getBundle, positions, refreshClaim } = usePerpetua();
  const bundle = getBundle(claimId);

  useEffect(() => {
    if (!Number.isNaN(claimId)) {
      void refreshClaim(claimId);
    }
  }, [claimId, refreshClaim]);

  if (!bundle) {
    return (
      <div className="panel" style={{ padding: 32 }}>
        <p style={{ color: "var(--muted)", marginBottom: 12 }}>
          Claim #{id} was not found in the active ledger.
        </p>
        <Link href="/" className="btn">
          <ArrowLeft size={14} />
          <span>Back to Encyclopedia</span>
        </Link>
      </div>
    );
  }

  const { claim, market, history, article, ruling } = bundle;
  const band = confidenceBand(market.yes_price_e6);
  const pillClass =
    band === "high" ? "pill-yes" : band === "low" ? "pill-no" : "pill-contested";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Breadcrumb & Header */}
      <div>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            color: "var(--muted)",
            marginBottom: 10,
            transition: "color 0.15s ease",
          }}
        >
          <ArrowLeft size={13} />
          <span>All Claims</span>
        </Link>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ maxWidth: 840 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span className="pill tabular" style={{ fontSize: 11 }}>
                Claim #{claim.id}
              </span>
              <span className="pill" style={{ fontSize: 11 }}>
                {claim.category}
              </span>
              <span className="pill tabular" style={{ fontSize: 11 }}>
                Epoch #{market.epoch} · {market.status}
              </span>
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: "-0.015em",
                color: "var(--ink)",
              }}
            >
              {claim.text}
            </h1>
          </div>

          {/* Prominent Confidence Badge */}
          <div
            className="panel"
            style={{
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                Implied Confidence
              </div>
              <div className="tabular" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: "var(--ink)" }}>
                {formatPct(market.yes_price_e6, 1)}
              </div>
            </div>
            <span className={`pill ${pillClass}`} style={{ fontWeight: 600 }}>
              {band === "high" ? "Supported" : band === "low" ? "Disputed" : "Contested"}
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-column workspace */}
      <div className="claim-grid">
        {/* Left: AI Article, Chart, Reserves & Evidence */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ConfidenceArticle article={article} onChainPageHash={claim.page_hash} />

          <PriceHistoryChart points={history} />

          {/* Market Reserves & Cited Evidence */}
          <section className="panel" style={{ padding: "18px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 12,
              }}
            >
              <Coins size={14} color="var(--accent)" />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                Pool Accounting & Solvency Reserves
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 10,
                paddingBottom: 14,
                marginBottom: 14,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ padding: "8px 10px", borderRadius: 5, background: "var(--surface-muted)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>YES Reserve</div>
                <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: "var(--yes)" }}>
                  {formatNear(market.yes_reserve, 3)} Ⓝ
                </div>
              </div>
              <div style={{ padding: "8px 10px", borderRadius: 5, background: "var(--surface-muted)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>NO Reserve</div>
                <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: "var(--no)" }}>
                  {formatNear(market.no_reserve, 3)} Ⓝ
                </div>
              </div>
              <div style={{ padding: "8px 10px", borderRadius: 5, background: "var(--surface-muted)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Collateral Vault</div>
                <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: "var(--ink)" }}>
                  {formatNear(market.collateral_vault, 3)} Ⓝ
                </div>
              </div>
              <div style={{ padding: "8px 10px", borderRadius: 5, background: "var(--surface-muted)" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Fee Pool</div>
                <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: "var(--contested)" }}>
                  {formatNear(market.fee_pool, 4)} Ⓝ
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--ink)" }}>
              <Link2 size={13} color="var(--muted)" />
              <span>Cited Source Evidence</span>
            </div>
            {claim.evidence_uris.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--muted)" }}>No external evidence URIs attached.</p>
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {claim.evidence_uris.map((uri) => (
                  <li key={uri}>
                    <a
                      href={uri}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12.5,
                        color: "var(--accent)",
                        wordBreak: "break-all",
                      }}
                    >
                      <span>{uri}</span>
                      <ExternalLink size={12} style={{ flexShrink: 0 }} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Rail: Trade + Escalation/Jury */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <TradeWidget claimId={claim.id} market={market} position={positions[claim.id]} />
          <EscalatePanel
            claimId={claim.id}
            market={market}
            ruling={ruling}
            position={positions[claim.id]}
          />
        </aside>
      </div>
    </div>
  );
}
