"use client";

import React, { useState } from "react";
import { formatPct } from "@/lib/amm";
import { PricePoint } from "@/lib/types";

interface PriceHistoryChartProps {
  points: PricePoint[];
}

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 680;
  const height = 210;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const safePoints =
    points.length > 0
      ? points
      : [{ timestampMs: Date.now(), yesPriceE6: 500_000, eventLabel: "Initial" }];

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

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className="panel" style={{ padding: "20px 24px" }}>
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
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Market Implied Confidence (YES)</h2>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
            {active.pt.eventLabel ?? "CPMM trade"} · {formatTime(active.pt.timestampMs)}
            {active.pt.trader ? ` · ${active.pt.trader}` : ""}
          </p>
        </div>
        <div className="tabular" style={{ fontSize: 18, fontWeight: 600, color: "var(--yes)" }}>
          {formatPct(active.pt.yesPriceE6, 1)}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Market confidence probability history chart"
      >
        {gridTicks.map((tick) => {
          const y = padTop + (1 - tick / 1_000_000) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke={tick === 500_000 ? "#cfcac0" : "#eceae2"}
                strokeWidth={1}
                strokeDasharray={tick === 500_000 ? "3 3" : undefined}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#5c5f66"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {Math.round(tick / 10_000)}%
              </text>
            </g>
          );
        })}

        <line
          x1={padLeft}
          y1={padTop + plotH}
          x2={width - padRight}
          y2={padTop + plotH}
          stroke="#cfcac0"
          strokeWidth={1}
        />

        {coords.length > 1 && (
          <polyline
            fill="none"
            stroke="#0f6d4a"
            strokeWidth={2}
            points={polylinePoints}
          />
        )}

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
              {isEvent && (
                <line
                  x1={c.x}
                  y1={padTop}
                  x2={c.x}
                  y2={padTop + plotH}
                  stroke="#cfcac0"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 5 : isEvent ? 3.5 : 2.5}
                fill={isActive ? "#141517" : "#0f6d4a"}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        <text
          x={padLeft}
          y={height - 6}
          fontSize="11"
          fill="#5c5f66"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {formatTime(minTs)}
        </text>
        <text
          x={width - padRight}
          y={height - 6}
          textAnchor="end"
          fontSize="11"
          fill="#5c5f66"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {formatTime(maxTs)}
        </text>
      </svg>
    </section>
  );
}

