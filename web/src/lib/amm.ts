import { Outcome } from "./types";

export const BPS_DENOMINATOR = 10_000n;
export const PRICE_SCALE = 1_000_000n;
export const MAX_FEE_BPS = 1_000n;
export const MIN_RESERVE = 1_000_000n;
export const YOCTO_PER_NEAR = 1_000_000_000_000_000_000_000_000n;

export function priceE6(yesReserve: bigint, noReserve: bigint): { yes: number; no: number } {
  const total = yesReserve + noReserve;
  if (total <= 0n) return { yes: 500_000, no: 500_000 };
  const yes = Number((noReserve * PRICE_SCALE) / total);
  return { yes, no: Number(PRICE_SCALE) - yes };
}

function divCeil(num: bigint, den: bigint): bigint {
  if (den <= 0n) throw new Error("Division by zero");
  return (num + den - 1n) / den;
}

function isqrtFloor(n: bigint): bigint {
  if (n < 0n) throw new Error("Negative sqrt");
  if (n < 2n) return n;
  let x0 = n;
  let x1 = (x0 + n / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) >> 1n;
  }
  return x0;
}

function isqrtCeil(n: bigint): bigint {
  const f = isqrtFloor(n);
  return f * f === n ? f : f + 1n;
}

export interface BuyQuoteTs {
  sharesOut: bigint;
  fee: bigint;
  netCollateral: bigint;
  newYesReserve: bigint;
  newNoReserve: bigint;
  postYesPriceE6: number;
  postNoPriceE6: number;
}

export interface SellQuoteTs {
  grossCollateral: bigint;
  netCollateral: bigint;
  fee: bigint;
  newYesReserve: bigint;
  newNoReserve: bigint;
  postYesPriceE6: number;
  postNoPriceE6: number;
}

/** Exact bigint mirror of `contract/src/amm.rs::quote_buy`. */
export function quoteBuy(
  yesReserve: bigint,
  noReserve: bigint,
  collateralIn: bigint,
  outcome: Outcome,
  feeBps: number
): BuyQuoteTs | null {
  const bps = BigInt(feeBps);
  if (collateralIn <= 0n || bps > MAX_FEE_BPS) return null;
  if (yesReserve < MIN_RESERVE || noReserve < MIN_RESERVE) return null;

  const fee = divCeil(collateralIn * bps, BPS_DENOMINATOR);
  const netCollateral = collateralIn - fee;
  if (netCollateral <= 0n) return null;

  const k = yesReserve * noReserve;
  let newYes: bigint;
  let newNo: bigint;
  let swapOut: bigint;

  if (outcome === "Yes") {
    newNo = noReserve + netCollateral;
    newYes = divCeil(k, newNo);
    if (newYes < MIN_RESERVE) return null;
    swapOut = yesReserve - newYes;
  } else {
    newYes = yesReserve + netCollateral;
    newNo = divCeil(k, newYes);
    if (newNo < MIN_RESERVE) return null;
    swapOut = noReserve - newNo;
  }

  const sharesOut = netCollateral + swapOut;
  const post = priceE6(newYes, newNo);
  return {
    sharesOut,
    fee,
    netCollateral,
    newYesReserve: newYes,
    newNoReserve: newNo,
    postYesPriceE6: post.yes,
    postNoPriceE6: post.no,
  };
}

/** Exact bigint mirror of `contract/src/amm.rs::quote_sell`. */
export function quoteSell(
  yesReserve: bigint,
  noReserve: bigint,
  sharesIn: bigint,
  outcome: Outcome,
  feeBps: number
): SellQuoteTs | null {
  const bps = BigInt(feeBps);
  if (sharesIn <= 0n || bps > MAX_FEE_BPS) return null;
  if (yesReserve < MIN_RESERVE || noReserve < MIN_RESERVE) return null;

  const rIn = outcome === "Yes" ? yesReserve : noReserve;
  const rOut = outcome === "Yes" ? noReserve : yesReserve;

  const b = rIn + rOut + sharesIn;
  const disc = b * b - 4n * sharesIn * rOut;
  if (disc < 0n) return null;

  const sqrtDisc = isqrtCeil(disc);
  const grossCollateral = (b - sqrtDisc) >> 1n;
  if (grossCollateral <= 0n) return null;

  const newROut = rOut - grossCollateral;
  const newRIn = rIn + sharesIn - grossCollateral;
  if (newROut < MIN_RESERVE || newRIn < MIN_RESERVE) return null;

  const fee = divCeil(grossCollateral * bps, BPS_DENOMINATOR);
  const netCollateral = grossCollateral - fee;
  if (netCollateral <= 0n) return null;

  const newYes = outcome === "Yes" ? newRIn : newROut;
  const newNo = outcome === "Yes" ? newROut : newRIn;
  const post = priceE6(newYes, newNo);

  return {
    grossCollateral,
    netCollateral,
    fee,
    newYesReserve: newYes,
    newNoReserve: newNo,
    postYesPriceE6: post.yes,
    postNoPriceE6: post.no,
  };
}

export function formatNear(yocto: string | bigint, decimals = 3): string {
  const v = typeof yocto === "string" ? BigInt(yocto || "0") : yocto;
  const whole = v / YOCTO_PER_NEAR;
  const rem = v % YOCTO_PER_NEAR;
  const fracStr = rem.toString().padStart(24, "0").slice(0, decimals);
  if (decimals === 0) return whole.toString();
  return `${whole.toString()}.${fracStr}`;
}

export function parseNearToYocto(input: string): bigint {
  const clean = input.trim();
  if (!clean || !/^\d+(\.\d+)?$/.test(clean)) return 0n;
  const [intPart, fracPart = ""] = clean.split(".");
  const paddedFrac = fracPart.slice(0, 24).padEnd(24, "0");
  return BigInt(intPart) * YOCTO_PER_NEAR + BigInt(paddedFrac);
}

export function formatPct(priceE6Val: number, decimals = 1): string {
  return `${(priceE6Val / 10_000).toFixed(decimals)}%`;
}

