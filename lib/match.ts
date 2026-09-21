/**
 * Match listings to watches by keyword in title/description/rawType.
 * Keywords within a watch are OR'd (any synonym hit counts).
 * Photo matching via lib/vision when ESTATESNIPE_VISION_ENABLED=true.
 */

import type { SaleListing } from "./sources/types";
import { parseWatchIntent } from "./parseWatchIntent";

export type WatchInput = {
  /** Raw keyword or short phrase */
  text: string;
  excludeAuctions?: boolean;
};

export type MatchSource = "text" | "photo" | "both";

export type MatchHit = {
  listing: SaleListing;
  matchedWatch: string;
  matchedKeywords: string[];
  score: number;
  /** Where the keyword was found */
  fields: Array<"title" | "description" | "category">;
  /**
   * True when listing is in the soft near-miss band
   * (radiusMi < distance <= softMax), not a hard in-radius match.
   */
  outsideRadius?: boolean;
  /** How this listing matched — text keywords, vision photos, or both */
  matchSource?: MatchSource;
  /** Vision confidence 0–1 when matchSource includes photo */
  visionConfidence?: number;
  /** Short model reason for UI badge */
  visionReason?: string;
  visionLabels?: string[];
  photoUrlsUsed?: string[];
};

/** Grounded synonym sets — OR'd; keep short, not endless. */
const SYNONYMS: Record<string, string[]> = {
  mcm: [
    "mcm",
    "mid-century",
    "midcentury",
    "mid century",
    "modern furniture",
  ],
  "mid-century": [
    "mcm",
    "mid-century",
    "midcentury",
    "mid century",
    "modern furniture",
  ],
  midcentury: [
    "mcm",
    "mid-century",
    "midcentury",
    "mid century",
    "modern furniture",
  ],
  pokemon: ["pokemon", "pokémon", "trading cards"],
  pokémon: ["pokemon", "pokémon", "trading cards"],
  "sealed pokemon": ["sealed pokemon", "sealed pokémon", "pokemon"],
  tools: [
    "tools",
    "tool",
    "toolbox",
    "craftsman",
    "dewalt",
    "milwaukee",
    "makita",
    "herramientas",
    "herramienta",
  ],
  tool: [
    "tools",
    "tool",
    "toolbox",
    "craftsman",
    "dewalt",
    "milwaukee",
    "makita",
    "herramientas",
  ],
  herramientas: [
    "tools",
    "tool",
    "toolbox",
    "craftsman",
    "dewalt",
    "milwaukee",
    "makita",
    "herramientas",
  ],
  "sports cards": ["sports cards", "sports card", "trading cards"],
  vinyl: ["vinyl", "records", "record", "lp", "lps", "vinilo", "vinilos"],
  record: ["vinyl", "records", "record", "lp", "album"],
  records: ["vinyl", "records", "record", "lp", "album"],
  sterling: ["sterling", "plata", "silverware", "flatware"],
  // Title fallbacks only. Missing keys still match the typed phrase itself
  // and, if the title misses, still go to vision. This is not a category gate.
  pyrex: ["pyrex", "corningware", "corning ware"],
  "blue pyrex": ["blue pyrex", "pyrex"],
  "cast iron": ["cast iron", "cast-iron", "griswold"],
  griswold: ["griswold", "cast iron", "cast-iron"],
  "levi 501": ["levi 501", "levis 501", "levi's 501", "501 jeans"],
  levis: ["levis", "levi's", "levi"],
  levi: ["levi", "levis", "levi's"],
  jewelry: ["jewelry", "jewellery", "necklace", "bracelet", "brooch"],
  jewellery: ["jewellery", "jewelry"],
  china: ["china", "porcelain", "fine china", "fiesta"],
  credenza: ["credenza", "sideboard"],
  eames: ["eames"],
  typewriter: ["typewriter"],
  "first edition": ["first edition", "1st edition"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // fold accents (pokémon → pokemon)
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Expand a watch keyword into OR'd title phrases (always includes itself).
 * The synonym table is a title fallback for common words, not a gate:
 * unknown phrases still match titles on their own tokens and still go to vision.
 */
export function expandKeyword(keyword: string): string[] {
  const k = normalize(keyword);
  if (!k) return [];
  const extras = SYNONYMS[k] || SYNONYMS[keyword.trim().toLowerCase()] || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of [keyword, ...extras]) {
    const n = normalize(term);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(term);
  }
  return out;
}

/** Expand a watch text into searchable terms via parseWatchIntent when useful */
export function watchTerms(text: string): {
  keywords: string[];
  excludeAuctions: boolean;
} {
  const parsed = parseWatchIntent(text);
  const keywords =
    parsed.keywords.length > 0
      ? parsed.keywords
      : text.trim()
        ? [text.trim()]
        : [];
  return {
    keywords,
    excludeAuctions: parsed.excludeAuctions,
  };
}

function phraseIn(haystack: string, phrase: string): boolean {
  const h = normalize(haystack);
  const k = normalize(phrase);
  if (!k || !h) return false;
  // Multi-word: require all tokens present (order-independent)
  const tokens = k.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((t) => h.includes(t));
  }
  return h.includes(k);
}

/** True if any synonym/phrase for this keyword hits the haystack. */
function keywordIn(haystack: string, keyword: string): boolean {
  return expandKeyword(keyword).some((phrase) => phraseIn(haystack, phrase));
}

function listingHaystacks(listing: SaleListing): {
  title: string;
  description: string;
  category: string;
} {
  return {
    title: listing.title || "",
    description: listing.description || "",
    // rawType is the closest thing we have to a category from sources
    category: listing.rawType || "",
  };
}

export function matchListings(
  listings: SaleListing[],
  watches: WatchInput[],
  options?: { outsideRadiusById?: Map<string, boolean> }
): MatchHit[] {
  const hits: MatchHit[] = [];
  const outsideMap = options?.outsideRadiusById;

  for (const listing of listings) {
    for (const watch of watches) {
      const { keywords, excludeAuctions } = watchTerms(watch.text);
      const skipAuctions = watch.excludeAuctions ?? excludeAuctions;
      if (skipAuctions && listing.isAuction) continue;

      const matchedKeywords: string[] = [];
      const fields = new Set<"title" | "description" | "category">();
      const bags = listingHaystacks(listing);

      // OR across keywords: any one synonym hit includes the listing
      for (const kw of keywords) {
        let hit = false;
        if (keywordIn(bags.title, kw)) {
          hit = true;
          fields.add("title");
        }
        if (keywordIn(bags.description, kw)) {
          hit = true;
          fields.add("description");
        }
        if (bags.category && keywordIn(bags.category, kw)) {
          hit = true;
          fields.add("category");
        }
        if (hit) matchedKeywords.push(kw);
      }

      if (matchedKeywords.length === 0) continue;

      // Score: fraction of OR-keywords matched + title bonus
      const score =
        matchedKeywords.length / Math.max(keywords.length, 1) +
        (fields.has("title") ? 0.15 : 0);

      hits.push({
        listing,
        matchedWatch: watch.text,
        matchedKeywords,
        score: Math.round(score * 100) / 100,
        fields: Array.from(fields),
        outsideRadius: outsideMap?.get(listing.id) ?? false,
        matchSource: "text",
      });
    }
  }

  // Dedupe by listing id — keep highest score
  const best = new Map<string, MatchHit>();
  for (const hit of hits) {
    const prev = best.get(hit.listing.id);
    if (!prev || hit.score > prev.score) best.set(hit.listing.id, hit);
  }

  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}

/** @deprecated Use lib/vision/matchPhotos — kept for callers expecting a stub. */
export function matchByImageCaption(
  _listing: SaleListing,
  _keywords: string[]
): boolean {
  return false;
}
