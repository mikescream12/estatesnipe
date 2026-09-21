/**
 * Vision / premium gating. Free plan = text+geo only.
 * Set ESTATESNIPE_VISION_ENABLED=true to exercise photo matching in tests/dev.
 * Scan applies the Stripe paywall when STRIPE_SECRET_KEY is set.
 * Until then this env switch stays the live photo-match control.
 */

function envFlag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Runtime switch — when false, vision never runs (free tier / default). */
export function isVisionEnabled(): boolean {
  return envFlag("ESTATESNIPE_VISION_ENABLED", false);
}

/**
 * Product flag for premium photo matching.
 * Today mirrors ESTATESNIPE_VISION_ENABLED; later AND with billing entitlement.
 */
export function isPremiumVision(): boolean {
  return isVisionEnabled() && envFlag("ESTATESNIPE_PREMIUM_VISION", true);
}

/** Alias used in scan / match wiring */
export const visionEnabled = (): boolean => isVisionEnabled();
export const premiumVision = (): boolean => isPremiumVision();

export function visionMinConfidence(): number {
  const n = envNum("ESTATESNIPE_VISION_MIN_CONFIDENCE", 0.72);
  return Math.min(0.99, Math.max(0.5, n));
}

export function visionMaxListings(): number {
  const n = envNum("ESTATESNIPE_VISION_MAX_LISTINGS", 25);
  return Math.min(80, Math.max(1, Math.floor(n)));
}

export function visionMaxPhotos(): number {
  const n = envNum("ESTATESNIPE_VISION_MAX_PHOTOS", 6);
  return Math.min(12, Math.max(1, Math.floor(n)));
}

export function visionConcurrency(): number {
  // Default 2: parallel gpt-4o photo calls were hitting 429 mid-scan.
  const n = envNum("ESTATESNIPE_VISION_CONCURRENCY", 2);
  return Math.min(6, Math.max(1, Math.floor(n)));
}

/** Per-listing vision call timeout (ms) */
export function visionTimeoutMs(): number {
  const n = envNum("ESTATESNIPE_VISION_TIMEOUT_MS", 25_000);
  return Math.min(60_000, Math.max(5_000, Math.floor(n)));
}

/** Prefer enriching listings that have fewer than this many photos */
export function visionEnrichBelowPhotoCount(): number {
  return envNum("ESTATESNIPE_VISION_ENRICH_BELOW", 3);
}

export type VisionRuntimeConfig = {
  visionEnabled: boolean;
  premiumVision: boolean;
  minConfidence: number;
  maxListings: number;
  maxPhotos: number;
  concurrency: number;
  timeoutMs: number;
};

export function getVisionConfig(): VisionRuntimeConfig {
  return {
    visionEnabled: isVisionEnabled(),
    premiumVision: isPremiumVision(),
    minConfidence: visionMinConfidence(),
    maxListings: visionMaxListings(),
    maxPhotos: visionMaxPhotos(),
    concurrency: visionConcurrency(),
    timeoutMs: visionTimeoutMs(),
  };
}
