"use client";

import React, { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatPct } from "@/lib/amm";
import { categoryLabel, chainTimeToDate, formatDateTime, hostOf } from "@/lib/format";
import { confidenceBand } from "@/lib/seedClaims";
import { ConfidenceArticle } from "@/components/ConfidenceArticle";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { TradeWidget } from "@/components/TradeWidget";
import { EscalatePanel } from "@/components/EscalatePanel";
import { ProbabilityReadout } from "@/components/claim/ProbabilityReadout";
import { MarketStats } from "@/components/claim/MarketStats";
import { ResolutionRecord } from "@/components/claim/ResolutionRecord";
import { StatusBadge } from "@/components/StatusBadge";
import { usePerpetua } from "@/providers/PerpetuaStore";

function ClaimSkeleton() {
  return (
    <div className="claim-page" aria-label="Loading claim">
      <div className="skeleton" style={{ height: 12, width: 160, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 36, width: "70%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 36, width: "45%", marginBottom: 40 }} />
      <div className="claim-grid">
        <div className="claim-main">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 18, width: `${92 - i * 9}%` }} />
          ))}
        </div>
        <div className="claim-side">
          <div className="skeleton" style={{ height: 150 }} />
          <div className="skeleton" style={{ height: 190 }} />
        </div>
      </div>
    </div>
  );
}

export default function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const claimId = Number(id);
  const { getBundle, positions, refreshClaim, loading } = usePerpetua();
  const bundle = getBundle(claimId);

  useEffect(() => {
    if (!Number.isNaN(claimId)) {
      void refreshClaim(claimId);
    }
  }, [claimId, refreshClaim]);

  if (!bundle) {
    if (loading) return <ClaimSkeleton />;
    return (
      <div className="panel" style={{ padding: 32 }}>
        <p style={{ color: "var(--muted)", marginBottom: 12 }}>
          Claim #{id} was not found in the active ledger.
        </p>
        <Link href="/encyclopedia" className="btn">
          <ArrowLeft size={14} />
          <span>Back to Encyclopedia</span>
        </Link>
      </div>
    );
  }

  const { claim, market, history, article, ruling } = bundle;
  const band = confidenceBand(market.yes_price_e6);
  const bandColor = band === "high" ? "var(--yes)" : band === "low" ? "var(--no)" : "var(--contested)";
  const createdAt = chainTimeToDate(claim.created_at);

  return (
    <div className="claim-page">
      {/* Breadcrumb & header */}
      <header style={{ marginBottom: 44 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
          <Link
            href="/encyclopedia"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, transition: "color var(--dur-fast) var(--ease)" }}
          >
            <ArrowLeft size={13} />
            <span>Encyclopedia</span>
          </Link>
          <span style={{ margin: "0 8px", color: "var(--muted-light)" }}>/</span>
          <span className="tabular">Claim #{claim.id}</span>
        </nav>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span className="pill">{categoryLabel(claim.category)}</span>
          <StatusBadge status={market.status} />
          <span className="tabular" style={{ fontSize: 12, color: "var(--muted)" }}>
            Epoch #{market.epoch}
          </span>
        </div>

        <h1
          className="serif"
          style={{
            fontSize: "clamp(28px, 3.6vw, 44px)",
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            maxWidth: 900,
          }}
        >
          {claim.text}
        </h1>

        <p className="tabular" style={{ marginTop: 16, fontSize: 12, color: "var(--muted)", overflowWrap: "anywhere" }}>
          Proposed by {claim.creator}
          {createdAt ? (
            <>
              {" · "}
              <time suppressHydrationWarning dateTime={createdAt.toISOString()}>
                {formatDateTime(createdAt)}
              </time>
            </>
          ) : ""}
        </p>
      </header>

      <div className="claim-grid">
        {/* Main column: article, evidence, resolution record */}
        <div className="claim-main">
          <ConfidenceArticle article={article} onChainPageHash={claim.page_hash} evidenceUris={claim.evidence_uris} />

          <section aria-labelledby="evidence-title">
            <div className="section-title">
              <h2 id="evidence-title">Evidence</h2>
              <span className="tabular" style={{ fontSize: 12, color: "var(--muted)" }}>
                {claim.evidence_uris.length} {claim.evidence_uris.length === 1 ? "source" : "sources"}
              </span>
            </div>
            {claim.evidence_uris.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--muted)" }}>No external evidence URIs attached.</p>
            ) : (
              <ol style={{ listStyle: "none", borderTop: "1px solid var(--border)" }}>
                {claim.evidence_uris.map((uri, i) => (
                  <li
                    key={uri}
                    id={`evidence-${i + 1}`}
                    style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 8, padding: "14px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <span className="tabular" style={{ color: "var(--accent)", fontSize: 12, paddingTop: 2 }}>
                      [{i + 1}]
                    </span>
                    <a
                      href={uri}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "block", minWidth: 0 }}
                      className="claim-link"
                    >
                      <span style={{ display: "block", fontSize: 14.5 }}>
                        {hostOf(uri)} <ExternalLink size={12} style={{ verticalAlign: "-1px", marginLeft: 4 }} aria-hidden="true" />
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted-light)", fontWeight: 400, overflowWrap: "anywhere", marginTop: 2 }}>
                        {uri}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="resolution-title">
            <div className="section-title">
              <h2 id="resolution-title">Resolution record</h2>
              <span className="tabular" style={{ fontSize: 12, color: bandColor }}>
                {formatPct(market.yes_price_e6, 1)} YES
              </span>
            </div>
            <ResolutionRecord bundle={bundle} />
          </section>
        </div>

        {/* Sidebar: probability, chart, trading, liquidity & epoch, escalation */}
        <aside className="claim-side" aria-label="Market">
          <ProbabilityReadout market={market} history={history} />
          <PriceHistoryChart points={history} compact />
          <div id="trade-panel">
            <TradeWidget claimId={claim.id} market={market} position={positions[claim.id]} />
          </div>
          <MarketStats market={market} />
          <EscalatePanel
            claimId={claim.id}
            market={market}
            ruling={ruling}
            position={positions[claim.id]}
            showVotes={false}
          />
        </aside>
      </div>

      {/* Mobile trade bar */}
      <div className="mobile-trade-bar">
        <div>
          <div className="eyebrow">YES</div>
          <div className="serif tabular" style={{ fontSize: 22, color: bandColor, lineHeight: 1.1 }}>
            {formatPct(market.yes_price_e6, 1)}
          </div>
        </div>
        <a href="#trade-panel" className="btn btn-primary">
          Trade
        </a>
      </div>
    </div>
  );
}
