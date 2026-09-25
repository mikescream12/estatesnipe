/**
 * Flip value helpers: honest estimate bands + threshold checks.
 * Never invents sell-through %. Labels estimates as "est."
 */

import type { SoldCompSummary } from "./ebayComps";

export type FlipValueEstimate = {
  /** Midpoint used for threshold checks */
  midUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
  /** "ebay" | "vision" | "heuristic" | "none" */
  source: "ebay" | "vision" | "heuristic" | "none";
  /** Short UI label, always marks estimate when not exact */
  label: string;
};

/** Rough heuristic bands for common flip categories — clearly "est." */
const HEURISTIC_BANDS: Array<{ pattern: RegExp; low: number; high: number }> = [
  { pattern: /\brolex\b/i, low: 2000, high: 12000 },
  { pattern: /\bgold\b|14k|18k|22k/i, low: 40, high: 400 },
  { pattern: /\bsterling\b|\b925\b/i, low: 20, high: 150 },
  { pattern: /\bpokemon\b|pokémon/i, low: 15, high: 200 },
  { pattern: /\blego\b/i, low: 25, high: 250 },
  { pattern: /\bvinyl\b|\brecords?\b/i, low: 10, high: 80 },
  { pattern: /\btools?\b|dewalt|craftsman|milwaukee/i, low: 20, high: 150 },
  { pattern: /\bjewelry\b|jewellery/i, low: 15, high: 120 },
  { pattern: /\bsealed\b/i, low: 30, high: 300 },
  { pattern: /\bpyrex\b/i, low: 15, high: 80 },
  { pattern: /\bcast\s*iron\b|griswold/i, low: 25, high: 200 },
];

export function heuristicValueBand(
  text: string
): { low: number; high: number } | null {
  const t = (text || "").trim();
  if (!t) return null;
  for (const row of HEURISTIC_BANDS) {
    if (row.pattern.test(t)) return { low: row.low, high: row.high };
  }
  return null;
}

export function estimateFromComps(
  comps: SoldCompSummary | null | undefined
): FlipValueEstimate | null {
  if (!comps || !comps.configured) return null;
  const low = comps.soldLowUsd ?? null;
  const high = comps.soldHighUsd ?? null;
  const mid =
    comps.medianSoldUsd != null
      ? comps.medianSoldUsd
      : low != null && high != null
        ? (low + high) / 2
        : low ?? high ?? null;
  if (mid == null && low == null && high == null) return null;
  const lo = low ?? mid;
  const hi = high ?? mid;
  return {
    midUsd: mid != null ? Math.round(mid) : null,
    lowUsd: lo != null ? Math.round(lo) : null,
    highUsd: hi != null ? Math.round(hi) : null,
    source: "ebay",
    label:
      lo != null && hi != null && lo !== hi
        ? `est. $${Math.round(lo)}–$${Math.round(hi)} (eBay)`
        : `est. $${Math.round(mid ?? lo ?? hi ?? 0)} (eBay)`,
  };
}

export function estimateFromVision(args: {
  valueEstLowUsd?: number | null;
  valueEstHighUsd?: number | null;
}): FlipValueEstimate | null {
  const low =
    typeof args.valueEstLowUsd === "number" && Number.isFinite(args.valueEstLowUsd)
      ? Math.max(0, args.valueEstLowUsd)
      : null;
  const high =
    typeof args.valueEstHighUsd === "number" && Number.isFinite(args.valueEstHighUsd)
      ? Math.max(0, args.valueEstHighUsd)
      : null;
  if (low == null && high == null) return null;
  const lo = low ?? high!;
  const hi = high ?? low!;
  const mid = (lo + hi) / 2;
  return {
    midUsd: Math.round(mid),
    lowUsd: Math.round(Math.min(lo, hi)),
    highUsd: Math.round(Math.max(lo, hi)),
    source: "vision",
    label:
      Math.round(lo) === Math.round(hi)
        ? `est. $${Math.round(mid)}`
        : `est. $${Math.round(Math.min(lo, hi))}–$${Math.round(Math.max(lo, hi))}`,
  };
}

export function estimateFromHeuristic(text: string): FlipValueEstimate | null {
  const band = heuristicValueBand(text);
  if (!band) return null;
  const mid = (band.low + band.high) / 2;
  return {
    midUsd: Math.round(mid),
    lowUsd: band.low,
    highUsd: band.high,
    source: "heuristic",
    label: `est. $${band.low}–$${band.high}`,
  };
}

/** Prefer eBay → vision → heuristic. */
export function resolveFlipValue(args: {
  comps?: SoldCompSummary | null;
  valueEstLowUsd?: number | null;
  valueEstHighUsd?: number | null;
  fallbackText?: string;
}): FlipValueEstimate {
  return (
    estimateFromComps(args.comps) ||
    estimateFromVision({
      valueEstLowUsd: args.valueEstLowUsd,
      valueEstHighUsd: args.valueEstHighUsd,
    }) ||
    (args.fallbackText ? estimateFromHeuristic(args.fallbackText) : null) || {
      midUsd: null,
      lowUsd: null,
      highUsd: null,
      source: "none",
      label: "",
    }
  );
}

/** True when estimate clears the user's min. Unknown estimate → null (don't filter). */
export function clearsMinValue(
  estimate: FlipValueEstimate | null | undefined,
  minAlertValueUsd: number | null | undefined
): boolean | null {
  if (minAlertValueUsd == null || !Number.isFinite(minAlertValueUsd) || minAlertValueUsd <= 0) {
    return null;
  }
  const mid = estimate?.midUsd ?? estimate?.lowUsd ?? null;
  if (mid == null) return null;
  return mid >= minAlertValueUsd;
}

export function formatMinThreshold(min: number): string {
  return `$${Math.round(min)}`;
}
