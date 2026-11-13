import React from "react";
import { confidenceBand } from "@/lib/seedClaims";

export function bandColor(yesPriceE6: number): string {
  const band = confidenceBand(yesPriceE6);
  return band === "high" ? "var(--yes)" : band === "low" ? "var(--no)" : "var(--contested)";
}

interface ProbabilityBarProps {
  yesPriceE6: number;
  width?: number | string;
  size?: "sm" | "lg";
  label?: string;
}

/** Horizontal YES-probability indicator; width eases when the price changes. */
export function ProbabilityBar({ yesPriceE6, width = 56, size = "sm", label }: ProbabilityBarProps) {
  const pct = Math.max(0, Math.min(100, yesPriceE6 / 10_000));
  return (
    <div
      className="prob-track"
      data-size={size}
      style={{ width }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label ?? "YES probability"}
    >
      <div className="prob-fill" style={{ width: `${pct}%`, background: bandColor(yesPriceE6) }} />
    </div>
  );
}
