/**
 * Batch vision pass for scan: text-misses with photos → nearest N → concurrency pool.
 * Every watch string is scored as free text. Synonym hits are skipped upstream;
 * phrases not in any table still reach the model.
 */

import type { SaleListing } from "../sources/types";
import type { MatchHit, WatchInput } from "../match";
import { watchTerms } from "../match";
import {
  getVisionConfig,
  isPremiumVision,
  isVisionEnabled,
} from "./config";
import { enrichListingPhotos } from "./enrichPhotos";
import { matchListingPhotos } from "./matchPhotos";
import { hasVisionApiKey } from "./provider";
import type { MatchSource, VisionMatchResult } from "./types";

export type VisionScanStats = {
  attempted: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  candidates: number;
  evaluated: number;
  matched: number;
  skippedReason?: string;
};

function listingDistance(l: SaleListing): number {
  return typeof l.distanceMiles === "number" && Number.isFinite(l.distanceMiles)
    ? l.distanceMiles
    : 9999;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Run vision on geo-kept listings that did not text-match.
 * Returns photo MatchHits + stats. Never throws.
 */
export async function runVisionPass(args: {
  listings: SaleListing[];
  watches: WatchInput[];
  textHitIds: Set<string>;
  outsideRadiusById?: Map<string, boolean>;
}): Promise<{ hits: MatchHit[]; stats: VisionScanStats }> {
  const cfg = getVisionConfig();
  const baseStats: VisionScanStats = {
    attempted: false,
    enabled: isVisionEnabled() && isPremiumVision(),
    hasApiKey: hasVisionApiKey(),
    candidates: 0,
    evaluated: 0,
    matched: 0,
  };

  if (!baseStats.enabled) {
    return {
      hits: [],
      stats: { ...baseStats, skippedReason: "vision_disabled" },
    };
  }

  // Still "attempt" structure when enabled but no key — callers see clear stats
  if (!baseStats.hasApiKey) {
    return {
      hits: [],
      stats: {
        ...baseStats,
        attempted: true,
        skippedReason: "no_api_key",
      },
    };
  }

  const textMisses = args.listings
    .filter((l) => !args.textHitIds.has(l.id))
    .filter((l) => (l.photos?.length || 0) > 0 || Boolean(l.url))
    .sort((a, b) => listingDistance(a) - listingDistance(b))
    .slice(0, cfg.maxListings);

  baseStats.candidates = textMisses.length;
  if (textMisses.length === 0) {
    return {
      hits: [],
      stats: { ...baseStats, attempted: true, skippedReason: "no_candidates" },
    };
  }

  // Enrich photos for sparse listings (best-effort, sequential rate-limit via http)
  const enriched: SaleListing[] = [];
  for (const listing of textMisses) {
    enriched.push(await enrichListingPhotos(listing));
  }

  const withPhotos = enriched.filter((l) => (l.photos?.length || 0) > 0);
  if (withPhotos.length === 0) {
    return {
      hits: [],
      stats: {
        ...baseStats,
        attempted: true,
        skippedReason: "no_photos_after_enrich",
      },
    };
  }

  type Job = {
    listing: SaleListing;
    watch: WatchInput;
    keywords: string[];
  };

  // One primary watch intent per listing: try watches in order until a match,
  // but cap total vision calls via jobs list length ≤ maxListings * watches
  // Strategy: for each listing, evaluate against each watch sequentially in worker
  // to avoid exploding cost — pick best watch by confidence.
  const hits: MatchHit[] = [];
  let evaluated = 0;
  let matched = 0;
  let circuitOpen = false;
  let circuitReason: string | undefined;

  const isFatalProviderError = (err?: string) =>
    !!err && /429|insufficient|no credits|billing|quota|401|invalid.api.key/i.test(err);

  await mapPool(withPhotos, cfg.concurrency, async (listing) => {
    if (circuitOpen) return;

    let best: {
      watch: WatchInput;
      keywords: string[];
      vision: VisionMatchResult;
    } | null = null;

    for (const watch of args.watches) {
      if (circuitOpen) break;
      const { keywords, excludeAuctions } = watchTerms(watch.text);
      const skipAuctions = watch.excludeAuctions ?? excludeAuctions;
      if (skipAuctions && listing.isAuction) continue;

      evaluated += 1;
      // Free-text query only. No category enum — unknown phrases still go to vision.
      const vision = await matchListingPhotos({
        intent: watch.text,
        keywords: keywords.length ? keywords : [watch.text],
        photos: listing.photos,
        listingTitle: listing.title,
        listingId: listing.id,
        minConfidence: cfg.minConfidence,
      });

      if (isFatalProviderError(vision.error)) {
        circuitOpen = true;
        circuitReason = vision.error;
        break;
      }

      if (
        vision.matched &&
        (!best || vision.confidence > best.vision.confidence)
      ) {
        best = { watch, keywords, vision };
      }
      // Early exit on strong match to save cost
      if (vision.matched && vision.confidence >= 0.9) break;
    }

    if (best?.vision.matched) {
      matched += 1;
      const matchSource: MatchSource = "photo";
      hits.push({
        listing,
        matchedWatch: best.watch.text,
        matchedKeywords: best.keywords.length
          ? best.keywords
          : [best.watch.text],
        score: Math.round(best.vision.confidence * 100) / 100,
        fields: [],
        outsideRadius: args.outsideRadiusById?.get(listing.id) ?? false,
        matchSource,
        visionConfidence: best.vision.confidence,
        visionReason: best.vision.reason,
        visionLabels: best.vision.labels,
        photoUrlsUsed: best.vision.photoUrlsUsed,
      });
    }
  });

  return {
    hits,
    stats: {
      ...baseStats,
      attempted: true,
      evaluated,
      matched,
      candidates: withPhotos.length,
      skippedReason: circuitOpen
        ? `provider_circuit: ${circuitReason?.slice(0, 120) || "error"}`
        : undefined,
    },
  };
}

/** Merge text + photo hits; upgrade to 'both' when same listing */
export function mergeTextAndPhotoHits(
  textHits: MatchHit[],
  photoHits: MatchHit[]
): MatchHit[] {
  const byId = new Map<string, MatchHit>();

  for (const h of textHits) {
    byId.set(h.listing.id, {
      ...h,
      matchSource: h.matchSource || "text",
    });
  }

  for (const h of photoHits) {
    const prev = byId.get(h.listing.id);
    if (!prev) {
      byId.set(h.listing.id, { ...h, matchSource: "photo" });
      continue;
    }
    byId.set(h.listing.id, {
      ...prev,
      matchSource: "both",
      score: Math.max(prev.score, h.score),
      visionConfidence: h.visionConfidence ?? prev.visionConfidence,
      visionReason: h.visionReason ?? prev.visionReason,
      visionLabels: h.visionLabels ?? prev.visionLabels,
      photoUrlsUsed: h.photoUrlsUsed ?? prev.photoUrlsUsed,
      matchedKeywords:
        prev.matchedKeywords.length > 0
          ? prev.matchedKeywords
          : h.matchedKeywords,
    });
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}
