"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Search, X } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { CONTRACT_ID, NETWORK_LABEL } from "@/lib/near";
import { categoryLabel, CATEGORY_LABELS } from "@/lib/format";
import { confidenceBand } from "@/lib/seedClaims";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { usePerpetua } from "@/providers/PerpetuaStore";
import { ProbabilityBar } from "@/components/ProbabilityBar";
import { StatusBadge } from "@/components/StatusBadge";

type SortKey = "registry" | "confidence" | "collateral";

function AnimatedPctText({ e6, decimals = 1 }: { e6: number; decimals?: number }) {
  const v = useAnimatedNumber(e6, 600);
  return <>{formatPct(v, decimals)}</>;
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <tr key={i} aria-hidden="true">
          <td className="c-claim">
            <div className="skeleton" style={{ height: 14, width: "72%" }} />
            <div className="skeleton" style={{ height: 10, width: "38%", marginTop: 8 }} />
          </td>
          <td className="c-domain">
            <div className="skeleton" style={{ height: 18, width: 80 }} />
          </td>
          <td>
            <div className="skeleton" style={{ height: 14, width: 64 }} />
          </td>
          <td className="c-epoch num">
            <div className="skeleton" style={{ height: 14, width: 28, marginLeft: "auto" }} />
          </td>
          <td className="num">
            <div className="skeleton" style={{ height: 14, width: 56, marginLeft: "auto" }} />
          </td>
          <td className="num c-conf">
            <div className="skeleton" style={{ height: 14, width: 110, marginLeft: "auto" }} />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function EncyclopediaPage() {
  const { bundles, mode, loading, lastError } = usePerpetua();
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("registry");

  // Known categories first, then any additional categories present in the data.
  const categoryKeys = useMemo(() => {
    const extra = Array.from(new Set(bundles.map((b) => b.claim.category))).filter(
      (c) => !(c in CATEGORY_LABELS)
    );
    return ["all", ...Object.keys(CATEGORY_LABELS), ...extra];
  }, [bundles]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: bundles.length };
    for (const b of bundles) counts[b.claim.category] = (counts[b.claim.category] ?? 0) + 1;
    return counts;
  }, [bundles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = bundles.filter((b) => {
      if (category !== "all" && b.claim.category !== category) return false;
      if (statusFilter !== "all" && b.market.status !== statusFilter) return false;
      if (q && !b.claim.text.toLowerCase().includes(q) && !String(b.claim.id).includes(q)) {
        return false;
      }
      return true;
    });
    if (sort === "confidence") {
      return [...rows].sort((a, b) => b.market.yes_price_e6 - a.market.yes_price_e6);
    }
    if (sort === "collateral") {
      return [...rows].sort((a, b) => {
        const d = BigInt(b.market.collateral_vault) - BigInt(a.market.collateral_vault);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      });
    }
    return rows;
  }, [bundles, category, statusFilter, query, sort]);

  const stats = useProtocolStats(bundles);
  const filtersActive = category !== "all" || statusFilter !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setCategory("all");
    setStatusFilter("all");
    setQuery("");
  };

  const sourceTone = lastError ? "error" : mode === "live" ? "live" : "demo";
  const contractShort = CONTRACT_ID
    ? CONTRACT_ID.length > 26
      ? `${CONTRACT_ID.slice(0, 12)}…${CONTRACT_ID.slice(-10)}`
      : CONTRACT_ID
    : null;

  return (
    <div className="terminal">
      <div className="terminal-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="terminal-title">Claim Registry</h1>
          <p className="terminal-sub">
            Continuous binary prediction markets pricing factual Web3 claims, with optimistic NEAR AI Cloud jury
            resolution.
          </p>
          <div className="status-strip" role="status">
            <span>
              <span className="status-dot" data-tone={sourceTone} data-pulse={loading ? "true" : "false"} />
              {mode === "demo" ? "Demo Ledger · seeded data" : `Live · NEAR ${NETWORK_LABEL}`}
            </span>
            {mode === "live" && contractShort && <span className="tabular">{contractShort}</span>}
            <span className="tabular">{loading ? "Syncing…" : `${bundles.length} claims loaded`}</span>
          </div>
        </div>

        <Link href="/create" className="btn btn-primary">
          <Plus size={14} />
          <span>Propose Claim</span>
        </Link>
      </div>

      {lastError && (
        <div
          className="panel"
          role="alert"
          style={{
            padding: "10px 14px",
            background: "var(--contested-bg)",
            borderColor: "var(--contested-border)",
            color: "var(--contested)",
            fontSize: 13,
          }}
        >
          {lastError}
        </div>
      )}

      {/* KPI strip */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-label">Tracked Claims</div>
          <div className="kpi-value tabular">{stats.totalClaims}</div>
          <div className="kpi-sub tabular">
            {stats.openClaims} open · {stats.settledClaims} settled
          </div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Active Disputes</div>
          <div
            className="kpi-value tabular"
            style={{ color: stats.activeDisputes > 0 ? "var(--contested)" : "var(--ink)" }}
          >
            {stats.activeDisputes}
          </div>
          <div className="kpi-sub">Escalated or ruled</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Pooled Collateral</div>
          <div className="kpi-value tabular">
            {formatNear(stats.totalVault, 2)} <span style={{ fontSize: 13, color: "var(--muted)" }}>Ⓝ</span>
          </div>
          <div className="kpi-sub">Across all vaults</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-label">Mean Confidence</div>
          <div
            className="kpi-value tabular"
            style={{
              color:
                stats.avgYes === null
                  ? "var(--ink)"
                  : confidenceBand(stats.avgYes) === "high"
                  ? "var(--yes)"
                  : confidenceBand(stats.avgYes) === "low"
                  ? "var(--no)"
                  : "var(--contested)",
            }}
          >
            {stats.avgYes === null ? "—" : <AnimatedPctText e6={stats.avgYes} />}
          </div>
          <div style={{ marginTop: 8 }}>
            <ProbabilityBar yesPriceE6={stats.avgYes ?? 500_000} width="100%" label="Mean YES confidence" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Search size={14} color="var(--muted-light)" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search claims by text or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search claims or #ID…"
            className="field-input"
            style={{ height: 34, paddingLeft: 32, fontSize: 13 }}
          />
        </div>

        <div className="segmented" role="group" aria-label="Filter by domain">
          {categoryKeys.map((key) => (
            <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>
              {key === "all" ? "All" : categoryLabel(key)}
              <span className="count tabular">{categoryCounts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="field-input"
            style={{ width: 128, height: 34, fontSize: 13 }}
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="Escalated">Escalated</option>
            <option value="Ruled">Ruled</option>
            <option value="Settled">Settled</option>
          </select>
          <select
            aria-label="Sort claims"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="field-input"
            style={{ width: 150, height: 34, fontSize: 13 }}
          >
            <option value="registry">Registry order</option>
            <option value="confidence">Highest confidence</option>
            <option value="collateral">Most collateral</option>
          </select>
        </div>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--muted)", minHeight: 20 }}
        aria-live="polite"
      >
        <span className="tabular">
          {filtered.length} of {bundles.length} claims
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              background: "none",
              border: 0,
              color: "var(--accent)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
            }}
          >
            <X size={12} /> Clear filters
          </button>
        )}
      </div>

      {/* Registry */}
      <section className="panel" style={{ overflow: "hidden", marginTop: -6 }} aria-label="Claim registry">
        <div style={{ overflowX: "auto" }}>
          <table className="registry">
            <thead>
              <tr>
                <th scope="col">Claim & primary citation</th>
                <th scope="col">Domain</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Epoch
                </th>
                <th scope="col" className="num">
                  Pool
                </th>
                <th scope="col" className="num">
                  Confidence (YES)
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && filtered.length === 0 ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
                    {bundles.length === 0
                      ? `No claims found on ${mode === "live" ? "the NEAR network" : "the ledger"}.`
                      : "No claims match the selected criteria."}
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const band = confidenceBand(b.market.yes_price_e6);
                  const pillClass =
                    band === "high" ? "pill-yes" : band === "low" ? "pill-no" : "pill-contested";
                  return (
                    <tr key={b.claim.id}>
                      <td className="c-claim" style={{ maxWidth: 560 }}>
                        <Link href={`/claims/${b.claim.id}`} className="claim-link">
                          <span className="tabular id">#{b.claim.id}</span>
                          <span>{b.claim.text}</span>
                          <ArrowUpRight size={13} className="go" aria-hidden="true" />
                        </Link>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--muted-light)",
                            marginTop: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {b.claim.evidence_uris[0] ?? "No external citation"}
                        </div>
                      </td>
                      <td className="c-domain" style={{ whiteSpace: "nowrap" }}>
                        <span className="pill" style={{ fontSize: 11.5 }}>
                          {categoryLabel(b.claim.category)}
                        </span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={b.market.status} />
                      </td>
                      <td className="c-epoch num tabular" style={{ color: "var(--muted)" }}>
                        #{b.market.epoch}
                      </td>
                      <td className="num tabular" data-label="Pool" style={{ whiteSpace: "nowrap" }}>
                        {formatNear(b.market.collateral_vault, 2)} Ⓝ
                      </td>
                      <td className="num c-conf" style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "flex-end" }}>
                          <ProbabilityBar yesPriceE6={b.market.yes_price_e6} width={64} />
                          <span className={`pill tabular ${pillClass}`} style={{ minWidth: 56, justifyContent: "center" }}>
                            <AnimatedPctText e6={b.market.yes_price_e6} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
