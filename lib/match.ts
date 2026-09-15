/**
 * Match listings to watches by keyword in title/description.
 * Optional: image-caption matching later (TODO).
 */

import type { SaleListing } from "./sources/types";
import { parseWatchIntent } from "./parseWatchIntent";

export type WatchInput = {
  /** Raw keyword or short phrase */
  text: string;
  excludeAuctions?: boolean;
};

export type MatchHit = {
  listing: SaleListing;
  matchedWatch: string;
  matchedKeywords: string[];
  score: number;
  /** Where the keyword was found */
  fields: Array<"title" | "description">;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function keywordIn(haystack: string, keyword: string): boolean {
  const h = normalize(haystack);
  const k = normalize(keyword);
  if (!k || !h) return false;
  // Multi-word: require all tokens present (order-independent)
  const tokens = k.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((t) => h.includes(t));
  }
  return h.includes(k);
}

export function matchListings(
  listings: SaleListing[],
  watches: WatchInput[]
): MatchHit[] {
  const hits: MatchHit[] = [];

  for (const listing of listings) {
    for (const watch of watches) {
      const { keywords, excludeAuctions } = watchTerms(watch.text);
      const skipAuctions = watch.excludeAuctions ?? excludeAuctions;
      if (skipAuctions && listing.isAuction) continue;

      const matchedKeywords: string[] = [];
      const fields = new Set<"title" | "description">();

      for (const kw of keywords) {
        let hit = false;
        if (keywordIn(listing.title, kw)) {
          hit = true;
          fields.add("title");
        }
        if (keywordIn(listing.description, kw)) {
          hit = true;
          fields.add("description");
        }
        if (hit) matchedKeywords.push(kw);
      }

      if (matchedKeywords.length === 0) continue;

      // Simple score: fraction of keywords matched + title bonus
      const score =
        matchedKeywords.length / Math.max(keywords.length, 1) +
        (fields.has("title") ? 0.15 : 0);

      hits.push({
        listing,
        matchedWatch: watch.text,
        matchedKeywords,
        score: Math.round(score * 100) / 100,
        fields: Array.from(fields),
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

// TODO: image-caption matching — when caption/OCR available on SalePhoto.caption
export function matchByImageCaption(
  _listing: SaleListing,
  _keywords: string[]
): boolean {
  return false;
}
