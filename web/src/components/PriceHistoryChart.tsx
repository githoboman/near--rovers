"use client";

import React, { useId, useState } from "react";
import { formatPct } from "@/lib/amm";
import { formatTimeUtc } from "@/lib/format";
import { PricePoint } from "@/lib/types";

interface PriceHistoryChartProps {
  points: PricePoint[];
  /** Compact variant for the sidebar. */
  compact?: boolean;
}

export function PriceHistoryChart({ points, compact = false }: PriceHistoryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradId = `chartGradient-${useId().replace(/:/g, "")}`;

  const width = compact ? 400 : 680;
  const height = compact ? 190 : 210;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  if (points.length === 0) {
    return (
      <section className="panel" style={{ padding: "18px 20px" }} aria-label="Price history">
        <h2 className="eyebrow">Price history · YES</h2>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
          No recorded price history for this epoch.
        </p>
      </section>
    );
  }

  const safePoints = points;

  const minTs = safePoints[0].timestampMs;
  const maxTs = Math.max(
    safePoints[safePoints.length - 1].timestampMs,
    minTs + 1000
  );

  const coords = safePoints.map((pt, idx) => {
    const x =
      safePoints.length === 1
        ? padLeft + plotW / 2
        : padLeft + ((pt.timestampMs - minTs) / (maxTs - minTs)) * plotW;
    const clampedP = Math.max(0, Math.min(1_000_000, pt.yesPriceE6));
    const y = padTop + (1 - clampedP / 1_000_000) * plotH;
    return { x, y, pt, idx };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const active = hoverIdx !== null ? coords[hoverIdx] : coords[coords.length - 1];
  const gridTicks = [0, 250_000, 500_000, 750_000, 1_000_000];

  // Build area fill polygon for subtle depth
  const areaPolygon = coords.length > 1
    ? `${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ` +
      coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ") +
      ` ${coords[coords.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)}`
    : "";

  return (
    <section className="panel" style={{ padding: "18px 20px" }} aria-label="Price history">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 className="eyebrow">Price history · YES</h2>
          <p suppressHydrationWarning style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {active.pt.eventLabel ?? "Trade execution"} · {formatTimeUtc(active.pt.timestampMs)} UTC
            {active.pt.trader ? ` · ${active.pt.trader}` : ""}
          </p>
        </div>
        <div className="tabular" style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)" }}>
          {formatPct(active.pt.yesPriceE6, 1)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Market confidence probability history chart"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c08b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00c08b" stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {/* Faint Horizontal Gridlines */}
        {gridTicks.map((tick) => {
          const y = padTop + (1 - tick / 1_000_000) * plotH;
          const isMid = tick === 500_000;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke={isMid ? "var(--border-strong)" : "var(--border)"}
                strokeWidth={1}
                strokeDasharray={isMid ? "3 3" : undefined}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10.5"
                fill="var(--muted-light)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {Math.round(tick / 10_000)}%
              </text>
            </g>
          );
        })}

        {/* Bottom baseline */}
        <line
          x1={padLeft}
          y1={padTop + plotH}
          x2={width - padRight}
          y2={padTop + plotH}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />

        {/* Area fill */}
        {areaPolygon && (
          <polygon className="chart-area" points={areaPolygon} fill={`url(#${gradId})`} />
        )}

        {/* Main curve */}
        {coords.length > 1 && (
          <polyline
            fill="none"
            stroke="#00c08b"
            strokeWidth={1.75}
            className="chart-line"
            pathLength={1}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylinePoints}
          />
        )}

        {/* Event points and hover markers */}
        {coords.map((c) => {
          const isEvent = Boolean(c.pt.eventLabel);
          const isActive = c.idx === active.idx;
          return (
            <g
              key={c.idx}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverIdx(c.idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {isActive && (
                <line
                  x1={c.x}
                  y1={padTop}
                  x2={c.x}
                  y2={padTop + plotH}
                  stroke="var(--muted)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 4.5 : isEvent ? 3 : 2}
                fill={isActive ? "var(--ink)" : "#00c08b"}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        {/* Time bounds */}
        <text
          x={padLeft}
          y={height - 6}
          fontSize="10.5"
          fill="var(--muted-light)"
          suppressHydrationWarning
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {formatTimeUtc(minTs)}
        </text>
        <text
          x={width - padRight}
          y={height - 6}
          textAnchor="end"
          fontSize="10.5"
          fill="var(--muted-light)"
          suppressHydrationWarning
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {formatTimeUtc(maxTs)}
        </text>
      </svg>
    </section>
  );
}
