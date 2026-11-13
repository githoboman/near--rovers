/** Presentation-only helpers (no financial logic lives here). */

/**
 * Converts a contract timestamp (u64 string, usually nanoseconds) to a Date.
 * Tolerates seconds / milliseconds / nanoseconds. Returns null when unusable.
 */
export function chainTimeToDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const big = BigInt(value);
    if (big <= 0n) return null;
    const digits = big.toString().length;
    let ms: number;
    if (digits >= 17) ms = Number(big / 1_000_000n);
    else if (digits >= 12) ms = Number(big);
    else ms = Number(big) * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatTimeUtc(timestampMs: number): string {
  const date = new Date(timestampMs);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(11, 19);
}

export function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

export function shortHash(hash: string, head = 10, tail = 6): string {
  return hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}

export const CATEGORY_LABELS: Record<string, string> = {
  audit_status: "Audit Status",
  authorship: "Who Built What",
  tvl: "TVL Claims",
};

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, " ");
}
