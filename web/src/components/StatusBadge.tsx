import React from "react";
import { MarketView } from "@/lib/types";

const TONE: Record<MarketView["status"], string> = {
  Open: "var(--yes)",
  Escalated: "var(--contested)",
  Ruled: "var(--contested)",
  Settled: "var(--muted-light)",
};

/** Compact market status label: coloured dot + text. */
export function StatusBadge({ status }: { status: MarketView["status"] }) {
  return (
    <span className="status-badge" data-tone={status === "Settled" ? "settled" : undefined}>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: TONE[status], flexShrink: 0 }}
      />
      {status}
    </span>
  );
}
