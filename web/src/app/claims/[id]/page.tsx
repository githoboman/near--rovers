"use client";

import React, { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
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
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 10,
          }}
        >
          <ArrowLeft size={14} />
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
          <div style={{ maxWidth: 820 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="pill tabular" style={{ fontSize: 11.5 }}>
                Claim #{claim.id}
              </span>
              <span className="pill" style={{ fontSize: 11.5 }}>
                {claim.category}
              </span>
              <span className="pill" style={{ fontSize: 11.5 }}>
                Epoch #{market.epoch} · {market.status}
              </span>
            </div>
            <h1
              className="serif"
              style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.015em" }}
            >
              {claim.text}
            </h1>
          </div>

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
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Market Confidence</div>
              <div className="tabular" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>
                {formatPct(market.yes_price_e6, 1)}
              </div>
            </div>
            <span className={`pill ${pillClass}`}>
              {band === "high" ? "Supported" : band === "low" ? "Disputed / Low" : "Contested"}
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-column workspace */}
      <div className="claim-grid">
        {/* Left: AI Article, Chart, Reserves & Evidence */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ConfidenceArticle article={article} onChainPageHash={claim.page_hash} />

          <PriceHistoryChart points={history} />

          {/* Market Mechanics & Cited Evidence */}
          <section className="panel" style={{ padding: "20px 24px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
              Evidence & Pool Accounting
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                paddingBottom: 16,
                marginBottom: 16,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>YES Reserve</div>
                <div className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>
                  {formatNear(market.yes_reserve, 3)} Ⓝ
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>NO Reserve</div>
                <div className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>
                  {formatNear(market.no_reserve, 3)} Ⓝ
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Collateral Vault</div>
                <div className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>
                  {formatNear(market.collateral_vault, 3)} Ⓝ
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Fee Pool</div>
                <div className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>
                  {formatNear(market.fee_pool, 4)} Ⓝ
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Cited Evidence</div>
            {claim.evidence_uris.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>No evidence URIs attached.</p>
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
                        fontSize: 13,
                        color: "var(--ink)",
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                      }}
                    >
                      <span>{uri}</span>
                      <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Rail: Trade + Escalation/Jury */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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

