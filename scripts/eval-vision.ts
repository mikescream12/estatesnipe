/**
 * Vision matching eval — documents expected behavior for EstateSnipe photo matching.
 *
 * Run:
 *   ESTATESNIPE_VISION_ENABLED=true npm run eval:vision
 *
 * Loads OPENAI_API_KEY from env or /home/box/agent-data/box-secrets.json (card.OPENAI_API_KEY).
 * Prefer OPENAI_VISION_MODEL=gpt-4o for quality.
 *
 * Expected behavior (quality bar: false positives worse than misses, esp. MCM):
 * 1) Clear MCM furniture photo + intent "MCM"     → matched=true, confidence >= 0.72
 * 2) Generic/modern non-MCM furniture + "MCM"     → matched=false (or conf < 0.72)
 * 3) Pokemon card art + intent "pokemon"          → matched=true
 * 4) Empty photo list                             → matched=false, error=no_photos
 * 5) No API key                                   → matched=false, error=no_api_key (skip live)
 * 6) Cache: second identical call hits cached=true
 * 7) Threshold: confidence 0.70 with matched raw → pipeline matched=false at 0.72
 *
 * Uses local fixture images (data URLs) for reproducibility.
 * Live cases SKIP (exit 0) on HTTP 429 / no credits — code is fine, billing blocker.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { matchPhotos } from "../lib/vision/matchPhotos";
import { expandKeyword } from "../lib/match";
import { parseWatchIntent } from "../lib/parseWatchIntent";
import {
  clearVisionMemoryCache,
  setCachedVision,
  getCachedVision,
  visionCacheKey,
} from "../lib/vision/cache";
import { hasVisionApiKey, detectVisionProvider } from "../lib/vision/provider";
import { getVisionConfig, visionMinConfidence } from "../lib/vision/config";
import { selectPhotoUrls } from "../lib/vision/enrichPhotos";
import { mergeTextAndPhotoHits } from "../lib/vision/scanVision";
import type { MatchHit } from "../lib/match";
import type { SaleListing } from "../lib/sources/types";

async function loadKeyFromBoxSecrets(): Promise<boolean> {
  if (process.env.OPENAI_API_KEY?.trim() || process.env.XAI_API_KEY?.trim()) {
    return true;
  }
  try {
    const raw = await fs.readFile(
      "/home/box/agent-data/box-secrets.json",
      "utf8"
    );
    const data = JSON.parse(raw) as {
      card?: Record<string, string>;
      OPENAI_API_KEY?: string;
    };
    const key = data.card?.OPENAI_API_KEY || data.OPENAI_API_KEY;
    if (key) {
      process.env.OPENAI_API_KEY = key;
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Local fixtures → data URLs (OpenAI cannot always fetch Wikimedia). */
async function fixtureDataUrl(name: string, mime: string): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const buf = await fs.readFile(path.join(here, "fixtures", name));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const TINY_THUMB =
  "https://example.com/sale/thumb_tiny_w=64.jpg";
const FULL_PHOTO =
  "https://example.com/sale/photo-full.jpg";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok  ${msg}`);
}

function isBillingBlocker(err?: string): boolean {
  if (!err) return false;
  return /429|insufficient|no credits|billing|quota/i.test(err);
}

function fakeListing(id: string): SaleListing {
  return {
    id,
    sourceId: "estatesales.net",
    title: id,
    description: "",
    url: "https://example.com/" + id,
    photos: [],
    fetchedAt: new Date().toISOString(),
  };
}

async function runOfflineStructural(): Promise<number> {
  let failed = 0;
  console.log("\n-- offline structural --");

  try {
    const r = await matchPhotos({
      intent: "MCM",
      keywords: ["mcm"],
      photoUrls: [],
    });
    assert(r.matched === false, "no_photos: matched=false");
    assert(r.error === "no_photos", "no_photos: error=no_photos");
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  try {
    const urls = selectPhotoUrls(
      [
        { url: TINY_THUMB, width: 64, height: 64 },
        { url: FULL_PHOTO, width: 1200, height: 900 },
        { url: FULL_PHOTO, width: 1200, height: 900 },
      ],
      6
    );
    assert(urls[0] === FULL_PHOTO, "selectPhotoUrls prefers full over thumb");
    assert(urls.length === 2, "selectPhotoUrls dedupes");
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  try {
    clearVisionMemoryCache();
    const intent = "mcm";
    const photos = [FULL_PHOTO];
    await setCachedVision(intent, photos, {
      matched: true,
      confidence: 0.88,
      labels: ["tapered legs", "walnut"],
      reason: "Classic MCM lounge chair",
      photoUrlsUsed: photos,
      provider: "openai",
      model: "gpt-4o",
    });
    const hit = await getCachedVision(intent, photos);
    assert(!!hit?.cached, "cache: get returns cached");
    assert(hit!.confidence === 0.88, "cache: confidence preserved");
    assert(
      visionCacheKey(intent, photos) ===
        visionCacheKey(" MCM ", [FULL_PHOTO]),
      "cache: key normalizes intent whitespace"
    );
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  try {
    const textHit: MatchHit = {
      listing: fakeListing("a"),
      matchedWatch: "mcm",
      matchedKeywords: ["mcm"],
      score: 1,
      fields: ["title"],
      matchSource: "text",
    };
    const photoHit: MatchHit = {
      listing: fakeListing("b"),
      matchedWatch: "mcm",
      matchedKeywords: ["mcm"],
      score: 0.81,
      fields: [],
      matchSource: "photo",
      visionConfidence: 0.81,
      visionReason: "Walnut dresser with tapered legs",
    };
    const bothPhoto: MatchHit = {
      listing: fakeListing("a"),
      matchedWatch: "mcm",
      matchedKeywords: ["mcm"],
      score: 0.9,
      fields: [],
      matchSource: "photo",
      visionConfidence: 0.9,
      visionReason: "Also saw MCM in photos",
    };
    const merged = mergeTextAndPhotoHits([textHit], [photoHit, bothPhoto]);
    assert(merged.length === 2, "merge: two listings");
    const a = merged.find((h) => h.listing.id === "a");
    const b = merged.find((h) => h.listing.id === "b");
    assert(a?.matchSource === "both", "merge: text+photo → both");
    assert(b?.matchSource === "photo", "merge: photo-only stays photo");
    assert(!!a?.visionReason, "merge: keeps visionReason on both");
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  try {
    const odd = parseWatchIntent(
      "zodiac quiz bowl trophy or hand-carved duck decoy"
    );
    assert(
      odd.keywords.some((k) => k.includes("zodiac")),
      "open query: unknown phrase is kept (not dropped for unknown category)"
    );
    assert(
      odd.keywords.some((k) => k.includes("duck")),
      "open query: OR splits into a second phrase"
    );
    const expanded = expandKeyword("zodiac quiz bowl trophy");
    assert(
      expanded.some((k) => k.toLowerCase().includes("zodiac")),
      "synonyms are not a gate: unknown phrase still searchable"
    );
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  try {
    assert(visionMinConfidence() >= 0.5, "minConfidence sane lower bound");
    const cfg = getVisionConfig();
    assert(cfg.maxListings <= 80, "maxListings capped");
    assert(cfg.concurrency >= 1, "concurrency >= 1");
  } catch (e) {
    failed++;
    console.error(String(e));
  }

  return failed;
}

async function runLive(): Promise<{ failed: number; skippedBilling: boolean }> {
  let failed = 0;
  let skippedBilling = false;

  const MCM_CHAIR = await fixtureDataUrl("mcm_eames_lounge.jpg", "image/jpeg");
  const GENERIC_SOFA = await fixtureDataUrl("generic_sofa.jpg", "image/jpeg");
  const POKEMON_CARD = await fixtureDataUrl("pokemon_pikachu.png", "image/png");
  const PYREX = await fixtureDataUrl("pyrex_dish.jpg", "image/jpeg");
  const SKILLET = await fixtureDataUrl("griswold_skillet.jpg", "image/jpeg");
  const TOOLS = await fixtureDataUrl("vintage_tools.jpg", "image/jpeg");
  const VINYL = await fixtureDataUrl("vinyl_lp.jpg", "image/jpeg");
  const CUTLERY = await fixtureDataUrl("cutlery.jpg", "image/jpeg");
  const TYPEWRITER = await fixtureDataUrl("typewriter.jpg", "image/jpeg");
  const LEVI = await fixtureDataUrl("levi_501.jpg", "image/jpeg");

  // Queries include starter chips (MCM, Pokemon) AND phrases that are not
  // on the chip/category lists (Pyrex, Griswold, Levi 501, typewriter, decoy).
  const cases: Array<{
    name: string;
    intent: string;
    keywords: string[];
    photoUrls: string[];
    expectMatched: boolean;
  }> = [
    {
      name: "mcm_positive_eames",
      intent: "MCM furniture",
      keywords: ["mcm", "mid-century"],
      photoUrls: [MCM_CHAIR],
      expectMatched: true,
    },
    {
      name: "mcm_negative_generic_sofa",
      intent: "MCM furniture",
      keywords: ["mcm", "mid-century"],
      photoUrls: [GENERIC_SOFA],
      expectMatched: false,
    },
    {
      name: "pokemon_positive",
      intent: "pokemon",
      keywords: ["pokemon"],
      photoUrls: [POKEMON_CARD],
      expectMatched: true,
    },
    {
      name: "pyrex_positive",
      intent: "Pyrex glass baking dish",
      keywords: ["pyrex"],
      photoUrls: [PYREX],
      expectMatched: true,
    },
    {
      name: "pyrex_negative_sofa",
      intent: "blue pyrex",
      keywords: ["pyrex"],
      photoUrls: [GENERIC_SOFA],
      expectMatched: false,
    },
    {
      name: "griswold_cast_iron_positive",
      intent: "Griswold cast iron skillet",
      keywords: ["cast iron", "griswold"],
      photoUrls: [SKILLET],
      expectMatched: true,
    },
    {
      name: "tools_positive",
      intent: "antique hand tools",
      keywords: ["tools"],
      photoUrls: [TOOLS],
      expectMatched: true,
    },
    {
      name: "vinyl_positive",
      intent: "12-inch vinyl LP",
      keywords: ["vinyl", "lp"],
      photoUrls: [VINYL],
      expectMatched: true,
    },
    {
      name: "cutlery_positive",
      intent: "silverware set",
      keywords: ["silverware", "flatware"],
      photoUrls: [CUTLERY],
      expectMatched: true,
    },
    {
      name: "odd_levi_501",
      intent: "Levi 501 red tab",
      keywords: ["levi 501"],
      photoUrls: [LEVI],
      expectMatched: true,
    },
    {
      name: "odd_typewriter",
      intent: "manual typewriter",
      keywords: ["typewriter"],
      photoUrls: [TYPEWRITER],
      expectMatched: true,
    },
    {
      name: "odd_or_pokemon",
      intent: "cast iron or pokemon cards",
      keywords: ["cast iron", "pokemon"],
      photoUrls: [POKEMON_CARD],
      expectMatched: true,
    },
    {
      name: "odd_negative_duck_decoy",
      intent: "hand-carved duck decoy",
      keywords: ["duck decoy"],
      photoUrls: [POKEMON_CARD],
      expectMatched: false,
    },
    {
      name: "odd_negative_first_edition",
      intent: "first edition Hemingway",
      keywords: ["first edition"],
      photoUrls: [SKILLET],
      expectMatched: false,
    },
    {
      name: "odd_negative_levi_on_sofa",
      intent: "Levi 501 or blue pyrex",
      keywords: ["levi 501", "pyrex"],
      photoUrls: [GENERIC_SOFA],
      expectMatched: false,
    },
  ];

  console.log("\n-- live vision (gpt-4o preferred) --");
  clearVisionMemoryCache();
  const cfg = getVisionConfig();
  let cacheChecked = false;

  for (const c of cases) {
    console.log(`\ncase: ${c.name}`);
    const r = await matchPhotos({
      intent: c.intent,
      keywords: c.keywords,
      photoUrls: c.photoUrls,
      listingTitle: `Eval ${c.name}`,
    });

    if (r.error && isBillingBlocker(r.error)) {
      console.log(
        `SKIP live (billing/quota): ${r.error.slice(0, 160)}`
      );
      skippedBilling = true;
      break;
    }

    if (r.error) {
      failed++;
      console.error(`FAIL ${c.name}: API error ${r.error.slice(0, 240)}`);
      continue;
    }

    console.log(
      `  query=${JSON.stringify(c.intent)} matched=${r.matched} conf=${r.confidence.toFixed(2)} reason=${JSON.stringify(r.reason)} labels=${JSON.stringify(r.labels)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      if (c.expectMatched) {
        assert(r.matched === true, `${c.name}: expected match`);
        assert(
          r.confidence >= cfg.minConfidence,
          `${c.name}: confidence >= ${cfg.minConfidence}`
        );
      } else {
        assert(
          r.matched === false,
          `${c.name}: matched=false (FP guard for MCM)`
        );
      }

      if (!cacheChecked) {
        const r2 = await matchPhotos({
          intent: c.intent,
          keywords: c.keywords,
          photoUrls: c.photoUrls,
        });
        assert(r2.cached === true, "cache: second call cached=true");
        cacheChecked = true;
      }
    } catch (e) {
      failed++;
      console.error(String(e));
    }
  }

  return { failed, skippedBilling };
}

async function main() {
  process.env.ESTATESNIPE_VISION_ENABLED =
    process.env.ESTATESNIPE_VISION_ENABLED || "true";
  process.env.OPENAI_VISION_MODEL =
    process.env.OPENAI_VISION_MODEL || "gpt-4o";
  process.env.ESTATESNIPE_VISION_MIN_CONFIDENCE =
    process.env.ESTATESNIPE_VISION_MIN_CONFIDENCE || "0.72";

  const loaded = await loadKeyFromBoxSecrets();
  const cfg = getVisionConfig();
  const provider = detectVisionProvider();

  console.log("--- EstateSnipe vision eval ---");
  console.log(
    `visionEnabled=${cfg.visionEnabled} minConfidence=${cfg.minConfidence} provider=${provider?.id ?? "none"} model=${provider?.model ?? "n/a"} keyLoaded=${loaded || hasVisionApiKey()}`
  );
  const key = process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || "";
  if (key) {
    console.log(
      `keyFingerprint=${createHash("sha256").update(key).digest("hex").slice(0, 10)}`
    );
  }

  let failed = await runOfflineStructural();

  if (!hasVisionApiKey()) {
    const mcm = await fixtureDataUrl("mcm_eames_lounge.jpg", "image/jpeg");
    const r = await matchPhotos({
      intent: "MCM",
      keywords: ["mcm"],
      photoUrls: [mcm],
    });
    try {
      assert(r.matched === false, "no_api_key: matched=false");
      assert(r.error === "no_api_key", "no_api_key: error set");
    } catch (e) {
      failed++;
      console.error(String(e));
    }
    console.log(
      "\nSKIP live cases — set OPENAI_API_KEY or XAI_API_KEY to run."
    );
    process.exit(failed ? 1 : 0);
  }

  const live = await runLive();
  failed += live.failed;

  if (live.skippedBilling) {
    console.log(
      "\nBLOCKER: OpenAI/xAI billing/quota — pipeline implemented; live eval skipped."
    );
  }

  console.log(
    `\n--- done failed=${failed} billingSkip=${live.skippedBilling} ---`
  );
  // Billing skip is not a code failure
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
