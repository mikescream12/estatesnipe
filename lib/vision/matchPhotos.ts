/**
 * Estate-sale photo matching via vision LLM.
 *
 * Required env (for live calls):
 *   OPENAI_API_KEY  + optional OPENAI_VISION_MODEL (default gpt-4o)
 *     OR
 *   XAI_API_KEY     + optional XAI_VISION_MODEL (default grok-2-vision-1212)
 *
 * Gating:
 *   ESTATESNIPE_VISION_ENABLED=true   — run vision in scans (testing / premium)
 *   ESTATESNIPE_VISION_MIN_CONFIDENCE=0.72
 *   ESTATESNIPE_VISION_MAX_LISTINGS=25
 *   ESTATESNIPE_VISION_MAX_PHOTOS=6
 *   ESTATESNIPE_VISION_CONCURRENCY=3
 *   ESTATESNIPE_VISION_TIMEOUT_MS=25000
 *
 * Quality bar: false positives worse than misses — especially MCM.
 * Without an API key, matchPhotos returns matched:false with error "no_api_key".
 */

import { getCachedVision, setCachedVision } from "./cache";
import {
  getVisionConfig,
  visionMinConfidence,
  visionTimeoutMs,
} from "./config";
import { selectPhotoUrls } from "./enrichPhotos";
import { detectVisionProvider, hasVisionApiKey } from "./provider";
import { isDataUrl, rehostPhotoUrlsForVision } from "./rehost";
import type {
  VisionMatchRequest,
  VisionMatchResult,
  VisionStructuredPayload,
} from "./types";
import type { SalePhoto } from "../sources/types";

/** Bump when SYSTEM_PROMPT changes so cached verdicts cannot outlive the prompt. */
const VISION_CACHE_SALT = "open-query-flip-v3";

function cacheIntent(intent: string): string {
  return `${VISION_CACHE_SALT}\n${intent}`;
}

const SYSTEM_PROMPT = `You are an expert estate-sale visual matcher for EstateSnipe.
A buyer typed a free-text hunt. Score the listing PHOTOS against THAT exact query.

There is NO supported-category list and NO enum of filters. Anything a person might type is in scope: brands, model numbers, slang, styles, materials, colors, and one-off phrases. Clothes, tools, glass, vinyl, toys, furniture, jewelry, books, sports, electronics, art, kitchenware, china, and specific names (Pyrex, Levi 501, Griswold, Eames, Rolex, Fiesta, a credenza, a first edition, a typewriter, a decoy) are examples of scope, not a limit.

Never refuse, abstain, or return an empty judgment because the query is unfamiliar, slangy, or not a "known category". Always judge the photos against the words.

CRITICAL — false positives are worse than misses:
- matched=true ONLY when the photos clearly show what the query asks for.
- Title, description, room context, and "could be" guesses are NOT evidence.
- If the item is absent, generic, or only vaguely similar, matched=false AND confidence MUST be below 0.72 (use 0.0–0.45).
- confidence >= 0.85 only when the match is unmistakable (readable logo/label/hallmark, or a classic silhouette you are sure of).
- 0.72–0.84 when the queried item is clearly present but cropped or a modifier is only partly visible.
- Below 0.72 when you would not bet the query is actually in the photos.

How to read ANY query:
- The typed words are the whole target. Interpret estate-sale language yourself.
- "or", commas, or "Pokemon or MCM" style alternatives: matched=true if ANY requested item is clearly visible.
- Combined constraints (brand + model, color + item, style + form) all have to hold when they are visually checkable. "blue pyrex" is not clear glass and not a random mug. "Levi 501" is not any jeans — need 501 cues (red Levi tab, arcuate stitching, or a readable 501 label). "Eames" is not any chair. "cast iron" is not stainless or enamel unless the iron is obvious.
- Style words ("MCM", "mid-century", "Danish modern", "atomic"): require the style. A generic sofa, farmhouse oak, particle-board, IKEA-like flat-pack, or overstuffed contemporary furniture is NOT mid-century modern.
- Brand words need the brand identifiable in the image (mark, hallmark, or unmistakable form). A plain mug is not Pyrex. Cardboard alone is not Pokemon. A book is not a vinyl record. Costume glitter is not sterling. A toolbox-less pile of clutter is not tools.
- Vague words ("tools", "jewelry", "vinyl", "china", "sports cards") match only when that kind of item is clearly visible, not because the sale looks old.

Strict calibration (examples of the bar, NOT a list of allowed queries):
- A normal living-room sofa, sectional, loveseat, or recliner is NOT "MCM", "mid-century", "Danish modern", or "Eames", even with wood legs, a low profile, or "clean lines". matched=false and confidence <= 0.30 unless the photo shows an iconic MCM piece (Eames lounge/shell, Saarinen, Nelson, walnut/teak case with tapered legs, etc.). "Might be mid-century" is a miss — keep confidence under 0.45.
- A plain mug, bowl, or unlabeled clear pan is NOT Pyrex. Need the Pyrex name, classic colored casserole, or unmistakable Pyrex glassware.
- Denim or any jeans are NOT "Levi 501" unless the red Levi tab, arcuate stitch, or a readable 501 label is visible.
- A hardcover, paperback, or CD is NOT vinyl and NOT a first edition. A poster of a record is not an LP.
- Random kitchen clutter is not cast iron and not tools.

Also fill flip research fields on every response (cheap extras — keep reason short):
- itemGuess: brief what the primary item is (e.g. "sealed Pokemon ETB", "oak dresser").
- portable: true if a reseller could carry/ship it alone; false for sofas, sectionals, armoires, large dressers, pianos, appliances, mattresses, and other massive furniture. Small chairs/side tables can be true if one person can move them.
- flipNotes: one short line for a flipper (condition/brand cue or "too big to flip").
- valueEstLowUsd / valueEstHighUsd: rough secondary-market USD band if you can estimate from what you see; otherwise omit or null. These are estimates only — never invent a sell-through percentage.

Output a single JSON object only:
{
  "matched": boolean,
  "confidence": number,
  "labels": string[],
  "reason": string,
  "itemGuess": string,
  "portable": boolean,
  "flipNotes": string,
  "valueEstLowUsd": number | null,
  "valueEstHighUsd": number | null
}`;

function buildUserText(req: VisionMatchRequest): string {
  const query = (req.intent || "").trim() || "(empty query)";
  const extras = (req.keywords || [])
    .map((k) => k.trim())
    .filter((k) => k && k.toLowerCase() !== query.toLowerCase());
  return [
    "HUNT QUERY (the only target — score the photos against these exact words):",
    query,
    extras.length
      ? `Buyer also accepts these as the same hunt (match if ANY is clearly shown): ${extras.join(", ")}`
      : null,
    req.listingTitle
      ? `Listing title (NOT evidence, context only): ${req.listingTitle}`
      : null,
    `Photos attached: ${req.photoUrls.length}`,
    "",
    "Does ANY attached photo clearly show the hunt query?",
    "Unknown brands, slang, materials, and one-off phrases are in scope. Do not reject for lack of a category.",
    "If it is not clearly shown, matched=false and confidence below 0.72.",
    "Respond with JSON only.",
  ]
    .filter(Boolean)
    .join("\n");
}

function applyThreshold(
  payload: VisionStructuredPayload,
  photoUrlsUsed: string[],
  minConfidence: number,
  meta: { provider?: VisionMatchResult["provider"]; model?: string }
): VisionMatchResult {
  const confidence = Math.min(1, Math.max(0, payload.confidence));
  const matched =
    Boolean(payload.matched) && confidence >= minConfidence && photoUrlsUsed.length > 0;
  return {
    matched,
    confidence,
    labels: payload.labels || [],
    reason: payload.reason || (matched ? "Visual match" : "Below confidence threshold"),
    itemGuess: payload.itemGuess,
    portable: payload.portable,
    flipNotes: payload.flipNotes,
    valueEstLowUsd: payload.valueEstLowUsd,
    valueEstHighUsd: payload.valueEstHighUsd,
    photoUrlsUsed,
    provider: meta.provider,
    model: meta.model,
  };
}

/**
 * Match watch intent against listing photos.
 * Caps photos, uses cache, skips live call when no API key.
 */
export async function matchPhotos(
  req: VisionMatchRequest,
  options?: { minConfidence?: number; maxPhotos?: number; timeoutMs?: number }
): Promise<VisionMatchResult> {
  const cfg = getVisionConfig();
  const minConfidence = options?.minConfidence ?? cfg.minConfidence;
  const maxPhotos = options?.maxPhotos ?? cfg.maxPhotos;
  const timeoutMs = options?.timeoutMs ?? cfg.timeoutMs;

  const photoUrls = selectPhotoUrls(
    req.photoUrls.map((url) => ({ url })),
    maxPhotos
  );

  if (photoUrls.length === 0) {
    return {
      matched: false,
      confidence: 0,
      labels: [],
      reason: "No usable listing photos",
      photoUrlsUsed: [],
      provider: "none",
      error: "no_photos",
    };
  }

  const cached = await getCachedVision(cacheIntent(req.intent), photoUrls);
  if (cached) {
    // Re-apply threshold in case env changed
    return {
      ...cached,
      matched: cached.matched && cached.confidence >= minConfidence,
      cached: true,
    };
  }

  if (!hasVisionApiKey()) {
    const skip: VisionMatchResult = {
      matched: false,
      confidence: 0,
      labels: [],
      reason: "Vision API key not configured",
      photoUrlsUsed: photoUrls,
      provider: "none",
      error: "no_api_key",
    };
    // Don't cache no_api_key forever — leave uncached so enabling a key works immediately
    return skip;
  }

  const provider = detectVisionProvider();
  if (!provider) {
    return {
      matched: false,
      confidence: 0,
      labels: [],
      reason: "No vision provider available",
      photoUrlsUsed: photoUrls,
      provider: "none",
      error: "no_provider",
    };
  }

  try {
    // Rehost http(s) images as data URLs so providers that cannot fetch
    // upstream CDNs (Wikimedia, some sale hosts) still get the pixels.
    const alreadyData = photoUrls.every(isDataUrl);
    const { apiUrls, originalUrls, failed } = alreadyData
      ? { apiUrls: photoUrls, originalUrls: photoUrls, failed: 0 }
      : await rehostPhotoUrlsForVision(photoUrls);

    if (apiUrls.length === 0) {
      return {
        matched: false,
        confidence: 0,
        labels: [],
        reason: "Could not download listing photos for vision",
        photoUrlsUsed: photoUrls,
        provider: provider.id,
        model: provider.model,
        error: `rehost_failed:${failed}`,
      };
    }

    const userContent = [
      { type: "text" as const, text: buildUserText({ ...req, photoUrls: originalUrls }) },
      ...apiUrls.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: "low" as const },
      })),
    ];

    const payload = await provider.complete({
      system: SYSTEM_PROMPT,
      userContent,
      timeoutMs,
    });

    // Cache + report against original URLs (not giant data URLs)
    const result = applyThreshold(payload, originalUrls, minConfidence, {
      provider: provider.id,
      model: provider.model,
    });

    await setCachedVision(cacheIntent(req.intent), originalUrls, result);
    return result;
  } catch (err) {
    return {
      matched: false,
      confidence: 0,
      labels: [],
      reason: "Vision call failed",
      photoUrlsUsed: photoUrls,
      provider: provider.id,
      model: provider.model,
      error: err instanceof Error ? err.message : "vision_error",
    };
  }
}

/** Convenience: match from SalePhoto[] */
export async function matchListingPhotos(args: {
  intent: string;
  keywords: string[];
  categories?: string[];
  photos: SalePhoto[];
  listingTitle?: string;
  listingId?: string;
  minConfidence?: number;
  timeoutMs?: number;
}): Promise<VisionMatchResult> {
  return matchPhotos(
    {
      intent: args.intent,
      keywords: args.keywords,
      categories: args.categories,
      photoUrls: selectPhotoUrls(args.photos),
      listingTitle: args.listingTitle,
      listingId: args.listingId,
    },
    {
      minConfidence: args.minConfidence ?? visionMinConfidence(),
      timeoutMs: args.timeoutMs,
    }
  );
}

export { visionMinConfidence, visionTimeoutMs, SYSTEM_PROMPT };
