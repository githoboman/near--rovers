"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { categoryLabel } from "@/lib/format";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { usePerpetua } from "@/providers/PerpetuaStore";
import { Reveal } from "@/components/Reveal";
import { StatusBadge } from "@/components/StatusBadge";
import { ProbabilityBar, bandColor } from "@/components/ProbabilityBar";
import { ClaimBundle } from "@/lib/types";

function Yes({ e6 }: { e6: number }) {
  const v = useAnimatedNumber(e6, 700);
  return <>{formatPct(v, 0)}</>;
}

function Row({ b, index }: { b: ClaimBundle; index: number }) {
  return (
    <Reveal as="li" delay={index * 70}>
      <Link href={`/claims/${b.claim.id}`} className="featured-row">
        <span className="tabular" style={{ color: "var(--muted-light)", fontSize: 12 }}>
          #{String(b.claim.id).padStart(2, "0")}
        </span>
        <div>
          <p className="featured-text">{b.claim.text}</p>
          <div className="featured-meta">
            <span>{categoryLabel(b.claim.category)}</span>
            <StatusBadge status={b.market.status} />
            <span className="tabular">
              {formatNear(b.market.collateral_vault, 2)} Ⓝ pooled · epoch #{b.market.epoch}
            </span>
          </div>
        </div>
        <div className="featured-prob">
          <div className="value" style={{ color: bandColor(b.market.yes_price_e6) }}>
            <Yes e6={b.market.yes_price_e6} />
          </div>
          <div className="label">YES probability</div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <ProbabilityBar yesPriceE6={b.market.yes_price_e6} width={120} />
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export function FeaturedClaims() {
  const { bundles, loading, mode } = usePerpetua();

  const featured = useMemo(
    () =>
      [...bundles]
        .sort((a, b) => {
          const diff = BigInt(b.market.collateral_vault) - BigInt(a.market.collateral_vault);
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        })
        .slice(0, 4),
    [bundles]
  );

  return (
    <section id="featured" className="l-section" aria-labelledby="featured-title">
      <div className="l-wrap">
        <div className="l-grid" style={{ alignItems: "end", marginBottom: 48 }}>
          <Reveal>
            <p className="eyebrow">Featured claims</p>
            <h2 id="featured-title" className="l-heading" style={{ marginTop: 18 }}>
              Where the market is looking.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="l-lede" style={{ marginTop: 0, maxWidth: 520 }}>
              The claims holding the most collateral right now
              {mode === "demo" ? ", drawn from the seeded Demo Ledger" : ""}. Open any of them to read the article,
              inspect the evidence and trade.
            </p>
          </Reveal>
        </div>

        {loading && featured.length === 0 ? (
          <div style={{ borderTop: "1px solid var(--border-strong)" }} aria-label="Loading claims">
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "30px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="skeleton" style={{ height: 24, width: "70%" }} />
                <div className="skeleton" style={{ height: 12, width: "35%", marginTop: 14 }} />
              </div>
            ))}
          </div>
        ) : featured.length === 0 ? (
          <p style={{ color: "var(--muted)", borderTop: "1px solid var(--border-strong)", paddingTop: 28 }}>
            No claims are available in the active ledger yet.
          </p>
        ) : (
          <ul className="featured-list">
            {featured.map((b, i) => (
              <Row key={b.claim.id} b={b} index={i} />
            ))}
          </ul>
        )}

        <Reveal delay={100} style={{ marginTop: 32 }}>
          <Link href="/encyclopedia" className="btn">
            <span>View the full registry</span>
            <ArrowRight size={14} className="arrow" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
