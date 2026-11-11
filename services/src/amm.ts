import type { Outcome } from "./types.ts";

export const PRICE_PRECISION = 1_000_000n;
export const BPS_DENOM = 10_000n;
export const YOCTO_PER_NEAR = 1_000_000_000_000_000_000_000_000n;

export function priceE6(reserveYes: bigint, reserveNo: bigint): { yes: number; no: number } {
  const total = reserveYes + reserveNo;
  if (total === 0n) {
    return { yes: 500_000, no: 500_000 };
  }
  const yes = Number((reserveNo * PRICE_PRECISION) / total);
  const no = Number(PRICE_PRECISION) - yes;
  return { yes, no };
}

function isqrtCeil(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrtCeil on negative");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x * x < n ? x + 1n : x;
}

export function quoteBuy(
  reserveYes: bigint,
  reserveNo: bigint,
  outcome: Outcome,
  collateralIn: bigint,
  feeBps: number,
): { sharesOut: bigint; fee: bigint; newYes: bigint; newNo: bigint } {
  if (collateralIn <= 0n) throw new Error("collateral_in must be > 0");
  const fee = (collateralIn * BigInt(feeBps)) / BPS_DENOM;
  const net = collateralIn - fee;
  if (net <= 0n) throw new Error("collateral_in too small after fee");

  const rTarget = outcome === "Yes" ? reserveYes : reserveNo;
  const rOther = outcome === "Yes" ? reserveNo : reserveYes;

  const newOther = rOther + net;
  const k = reserveYes * reserveNo;
  const newTarget = (k + newOther - 1n) / newOther;
  const swapOut = rTarget - newTarget;
  const sharesOut = net + swapOut;

  return outcome === "Yes"
    ? { sharesOut, fee, newYes: newTarget, newNo: newOther }
    : { sharesOut, fee, newYes: newOther, newNo: newTarget };
}

export function quoteSell(
  reserveYes: bigint,
  reserveNo: bigint,
  outcome: Outcome,
  sharesIn: bigint,
  feeBps: number,
): { netCollateralOut: bigint; grossCollateralOut: bigint; fee: bigint } {
  if (sharesIn <= 0n) throw new Error("shares_in must be > 0");
  const rTarget = outcome === "Yes" ? reserveYes : reserveNo;
  const rOther = outcome === "Yes" ? reserveNo : reserveYes;

  const b = rTarget + rOther + sharesIn;
  const fourK = 4n * reserveYes * reserveNo;
  const disc = b * b - fourK;
  const sqrtDisc = isqrtCeil(disc);
  const twoNet = b - sqrtDisc;
  const net = twoNet / 2n;
  if (net <= 0n) throw new Error("sell output rounds to zero");

  const fee = (net * BigInt(feeBps)) / BPS_DENOM;
  return {
    grossCollateralOut: net,
    fee,
    netCollateralOut: net - fee,
  };
}

export function yoctoToNearNumber(yoctoStr: string): number {
  const v = BigInt(yoctoStr || "0");
  const whole = v / YOCTO_PER_NEAR;
  const frac = v % YOCTO_PER_NEAR;
  return Number(whole) + Number(frac) / 1e24;
}

