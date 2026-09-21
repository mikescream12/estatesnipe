/**
 * Live quality spot-check: zip 92886, intent MCM / mid-century.
 * Fetches listings, text-matches, runs vision on text-misses with photos.
 * Prints all vision results >=0.5 conf for FP review.
 */
import { promises as fs } from "fs";
import { fetchAllSources } from "../lib/sources";
import { filterListingsByWatchGeo, softMaxMiles } from "../lib/geoFilter";
import { matchListings, type WatchInput } from "../lib/match";
import { enrichListingPhotos } from "../lib/vision/enrichPhotos";
import { matchListingPhotos } from "../lib/vision/matchPhotos";
import { getVisionConfig } from "../lib/vision/config";
import { hasVisionApiKey } from "../lib/vision/provider";

async function loadKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return;
  const raw = await fs.readFile("/home/box/agent-data/box-secrets.json", "utf8");
  const data = JSON.parse(raw) as { card?: Record<string, string> };
  if (data.card?.OPENAI_API_KEY) process.env.OPENAI_API_KEY = data.card.OPENAI_API_KEY;
}

async function main() {
  process.env.ESTATESNIPE_VISION_ENABLED = "true";
  process.env.OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  process.env.ESTATESNIPE_VISION_MIN_CONFIDENCE =
    process.env.ESTATESNIPE_VISION_MIN_CONFIDENCE || "0.72";
  // Cap cost for spot-check
  process.env.ESTATESNIPE_VISION_MAX_LISTINGS =
    process.env.ESTATESNIPE_VISION_MAX_LISTINGS || "18";
  process.env.ESTATESNIPE_VISION_MAX_PHOTOS =
    process.env.ESTATESNIPE_VISION_MAX_PHOTOS || "4";
  process.env.ESTATESNIPE_VISION_CONCURRENCY =
    process.env.ESTATESNIPE_VISION_CONCURRENCY || "2";

  await loadKey();
  const zip = process.env.CHECK_ZIP || "92886";
  const radius = Number(process.env.CHECK_RADIUS || "40");
  const intent = process.env.CHECK_INTENT || "mcm mid-century modern furniture";
  const cfg = getVisionConfig();

  console.log("--- live MCM vision check ---");
  console.log(
    JSON.stringify({
      zip,
      radius,
      intent,
      minConfidence: cfg.minConfidence,
      maxListings: cfg.maxListings,
      hasKey: hasVisionApiKey(),
    })
  );

  const fetchRadius = Math.min(100, Math.ceil(softMaxMiles(radius)));
  const { listings, statuses } = await fetchAllSources({
    zip,
    radiusMiles: fetchRadius,
    limit: 80,
  });
  console.log(
    "sources:",
    statuses
      .map((s) => `${s.sourceId}:${s.ok ? "ok" : "fail"}:${s.listingCount}`)
      .join(", ")
  );
  console.log("raw listings:", listings.length);

  const watches: WatchInput[] = [{ text: intent }];
  const soft = softMaxMiles(radius);
  const geoKept = await filterListingsByWatchGeo(listings, zip, radius);
  const kept = geoKept.map((g) => g.listing);
  console.log("geo kept:", kept.length, "softMax:", soft);

  const textHits = matchListings(kept, watches);
  const textHitIds = new Set(textHits.map((h) => h.listing.id));
  console.log("text hits:", textHits.length);
  for (const h of textHits.slice(0, 8)) {
    console.log(
      `  TEXT ${h.score} ${h.listing.title.slice(0, 70)} | ${h.matchedKeywords.join(",")}`
    );
  }

  const candidates = kept
    .filter((l) => !textHitIds.has(l.id))
    .filter((l) => (l.photos?.length || 0) > 0 || Boolean(l.url))
    .sort((a, b) => (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999))
    .slice(0, cfg.maxListings);

  console.log("vision candidates (text-misses):", candidates.length);

  const enriched = [];
  for (const l of candidates) {
    enriched.push(await enrichListingPhotos(l));
  }
  const withPhotos = enriched.filter((l) => (l.photos?.length || 0) > 0);
  console.log("with photos after enrich:", withPhotos.length);

  type Row = {
    id: string;
    title: string;
    distanceMiles: number | null;
    photoCount: number;
    matched: boolean;
    confidence: number;
    reason: string;
    labels: string[];
    error?: string;
    samplePhoto?: string;
  };
  const rows: Row[] = [];

  // sequential for clearer logs / rate friendliness
  for (const listing of withPhotos) {
    const vision = await matchListingPhotos({
      intent,
      keywords: ["mcm", "mid-century", "mid century", "danish modern", "eames"],
      categories: ["mcm_furniture"],
      photos: listing.photos,
      listingTitle: listing.title,
      listingId: listing.id,
      minConfidence: cfg.minConfidence,
    });
    const row: Row = {
      id: listing.id,
      title: listing.title.slice(0, 90),
      distanceMiles: listing.distanceMiles ?? null,
      photoCount: listing.photos.length,
      matched: vision.matched,
      confidence: vision.confidence,
      reason: vision.reason,
      labels: vision.labels,
      error: vision.error,
      samplePhoto: vision.photoUrlsUsed?.[0]?.slice(0, 120),
    };
    rows.push(row);
    const flag = vision.matched
      ? "PHOTO_MATCH"
      : vision.confidence >= 0.72
        ? "HIGH_REJECT?"
        : vision.error
          ? "ERROR"
          : "miss";
    console.log(
      `[${flag}] conf=${vision.confidence.toFixed(2)} photos=${listing.photos.length} dist=${listing.distanceMiles ?? "?"} | ${listing.title.slice(0, 60)}`
    );
    console.log(`         reason=${JSON.stringify(vision.reason)} labels=${JSON.stringify(vision.labels)}`);
    if (vision.error) console.log(`         error=${vision.error.slice(0, 160)}`);
  }

  const photoMatches = rows.filter((r) => r.matched);
  const suspicious = rows.filter(
    (r) => !r.matched && r.confidence >= cfg.minConfidence
  );
  const nearMisses = rows
    .filter((r) => !r.matched && r.confidence >= 0.5 && r.confidence < cfg.minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  const summary = {
    evaluated: rows.length,
    photoMatches: photoMatches.length,
    errors: rows.filter((r) => r.error).length,
    suspiciousHighReject: suspicious.length,
    nearMisses: nearMisses.length,
    samplePhotoMatchReasons: photoMatches.slice(0, 8).map((r) => ({
      title: r.title,
      conf: r.confidence,
      reason: r.reason,
      labels: r.labels,
      dist: r.distanceMiles,
    })),
    nearMissSamples: nearMisses.slice(0, 6).map((r) => ({
      title: r.title,
      conf: r.confidence,
      reason: r.reason,
      labels: r.labels,
    })),
  };

  await fs.writeFile(
    "/tmp/mcm-vision-check.json",
    JSON.stringify({ summary, rows }, null, 2)
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("wrote /tmp/mcm-vision-check.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
