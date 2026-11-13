"use client";

import { useMemo } from "react";
import { ClaimBundle } from "@/lib/types";

export interface ProtocolStats {
  totalClaims: number;
  openClaims: number;
  activeDisputes: number;
  settledClaims: number;
  totalVault: bigint;
  /** Mean YES price, scaled 1e6. `null` when there are no claims. */
  avgYes: number | null;
}

/** Derives protocol-level statistics from the claim bundles in the store. */
export function useProtocolStats(bundles: ClaimBundle[]): ProtocolStats {
  return useMemo(() => {
    const totalVault = bundles.reduce((acc, b) => acc + BigInt(b.market.collateral_vault), 0n);
    const activeDisputes = bundles.filter(
      (b) => b.market.status === "Escalated" || b.market.status === "Ruled"
    ).length;
    const openClaims = bundles.filter((b) => b.market.status === "Open").length;
    const settledClaims = bundles.filter((b) => b.market.status === "Settled").length;
    const avgYes =
      bundles.length > 0
        ? Math.round(bundles.reduce((acc, b) => acc + b.market.yes_price_e6, 0) / bundles.length)
        : null;
    return {
      totalClaims: bundles.length,
      openClaims,
      activeDisputes,
      settledClaims,
      totalVault,
      avgYes,
    };
  }, [bundles]);
}
