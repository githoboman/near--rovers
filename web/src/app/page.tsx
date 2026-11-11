"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { confidenceBand } from "@/lib/seedClaims";
import { usePerpetua } from "@/providers/PerpetuaStore";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All Claims",
  audit_status: "Audit Status",
  authorship: "Who Built What",
  tvl: "TVL Claims",
};

export default function HomePage() {
  const { bundles, mode, loading, lastError } = usePerpetua();
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundles.filter((b) => {
      if (category !== "all" && b.claim.category !== category) return false;
      if (statusFilter !== "all" && b.market.status !== statusFilter) return false;
      if (q && !b.claim.text.toLowerCase().includes(q) && !String(b.claim.id).includes(q)) {
        return false;
      }
      return true;
    });
  }, [bundles, category, statusFilter, query]);

  const stats = useMemo(() => {
    const totalVault = bundles.reduce((acc, b) => acc + BigInt(b.market.collateral_vault), 0n);
    const activeDisputes = bundles.filter(
      (b) => b.market.status === "Escalated" || b.market.status === "Ruled"
    ).length;
    const avgYes =
      bundles.length > 0
        ? Math.round(
            bundles.reduce((acc, b) => acc + b.market.yes_price_e6, 0) / bundles.length
          )
        : 500_000;
    return {
      totalClaims: bundles.length,
      activeDisputes,
      totalVault,
      avgYes,
    };
  }, [bundles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Editorial Title Row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1
            className="serif"
            style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}
          >
            Perpetua Encyclopedia
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", marginTop: 4 }}>
            Contested Web3 protocol facts priced by continuous binary prediction markets on NEAR{" "}
            {mode === "demo" ? "(Demo Ledger)" : "(Testnet)"}.
          </p>
        </div>

        <Link href="/create" className="btn btn-primary">
          <Plus size={15} />
          <span>Propose Claim</span>
        </Link>
      </div>

      {lastError && (
        <div
          className="panel"
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

      {/* 4-column hairline KPI strip */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Tracked Claims</div>
          <div className="tabular" style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}>
            {stats.totalClaims}
          </div>
        </div>
        <div className="kpi-cell">
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Active Disputes</div>
          <div className="tabular" style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}>
            {stats.activeDisputes}
          </div>
        </div>
        <div className="kpi-cell">
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Pooled Collateral</div>
          <div className="tabular" style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}>
            {formatNear(stats.totalVault, 2)}{" "}
            <span style={{ fontSize: 13, color: "var(--muted)" }}>NEAR</span>
          </div>
        </div>
        <div className="kpi-cell">
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Mean Confidence</div>
          <div className="tabular" style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}>
            {formatPct(stats.avgYes, 1)}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="btn btn-sm"
              onClick={() => setCategory(key)}
              style={{
                background: category === key ? "var(--ink)" : "var(--surface)",
                color: category === key ? "#ffffff" : "var(--ink)",
                borderColor: category === key ? "var(--ink)" : "var(--border)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="field-input"
            style={{ width: 130, height: 32, fontSize: 13 }}
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="Escalated">Escalated</option>
            <option value="Ruled">Ruled</option>
            <option value="Settled">Settled</option>
          </select>

          <div style={{ position: "relative", width: 240 }}>
            <Search
              size={14}
              color="var(--muted)"
              style={{ position: "absolute", left: 10, top: 9 }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search protocol claims..."
              className="field-input"
              style={{ height: 32, paddingLeft: 30, fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      {/* Claim Table */}
      <section className="panel" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>
              <th style={{ padding: "11px 16px", fontWeight: 500 }}>Claim & Citation</th>
              <th style={{ padding: "11px 12px", fontWeight: 500 }}>Domain</th>
              <th style={{ padding: "11px 12px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "11px 12px", fontWeight: 500, textAlign: "right" }}>Epoch</th>
              <th style={{ padding: "11px 16px", fontWeight: 500, textAlign: "right" }}>
                YES Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                  Loading market claims...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                  No claims match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const band = confidenceBand(b.market.yes_price_e6);
                const pillClass =
                  band === "high" ? "pill-yes" : band === "low" ? "pill-no" : "pill-contested";
                return (
                  <tr
                    key={b.claim.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "14px 16px", maxWidth: 560 }}>
                      <Link
                        href={`/claims/${b.claim.id}`}
                        style={{
                          fontWeight: 500,
                          display: "inline-flex",
                          alignItems: "baseline",
                          gap: 6,
                          lineHeight: 1.4,
                        }}
                      >
                        <span className="tabular" style={{ color: "var(--muted)", fontSize: 12.5 }}>
                          #{b.claim.id}
                        </span>
                        <span>{b.claim.text}</span>
                        <ArrowUpRight size={13} color="var(--muted)" style={{ flexShrink: 0 }} />
                      </Link>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginTop: 3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.claim.evidence_uris[0] ?? "No external citation"}
                      </div>
                    </td>

                    <td style={{ padding: "14px 12px", whiteSpace: "nowrap" }}>
                      <span className="pill" style={{ fontSize: 11.5 }}>
                        {CATEGORY_LABELS[b.claim.category] ?? b.claim.category}
                      </span>
                    </td>

                    <td style={{ padding: "14px 12px", whiteSpace: "nowrap" }}>
                      <span
                        className={`pill ${
                          b.market.status === "Escalated" || b.market.status === "Ruled"
                            ? "pill-contested"
                            : ""
                        }`}
                        style={{ fontSize: 11.5 }}
                      >
                        {b.market.status}
                      </span>
                    </td>

                    <td
                      className="tabular"
                      style={{ padding: "14px 12px", textAlign: "right", color: "var(--muted)" }}
                    >
                      #{b.market.epoch}
                    </td>

                    <td style={{ padding: "14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span className={`pill tabular ${pillClass}`}>
                        {formatPct(b.market.yes_price_e6, 1)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

