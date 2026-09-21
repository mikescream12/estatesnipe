/**
 * Best-effort photo enrichment for listings with few images.
 * For estatesales.net: try byid API include=pictures, then HTML og/img scrape.
 * Rate-limited; never throws — scan continues if detail fails.
 */

import { fetchCached } from "../sources/http";
import type { SaleListing, SalePhoto } from "../sources/types";
import { visionEnrichBelowPhotoCount, visionMaxPhotos } from "./config";

const ESN_BASE = "https://www.estatesales.net";

function preferFullUrl(p: SalePhoto): string {
  // Prefer full url over tiny thumbs
  const url = (p.url || "").trim();
  const thumb = (p.thumbnailUrl || "").trim();
  if (url) return url;
  return thumb;
}

/** Cap + prefer full-size URLs; allow https and data:image (eval / rehost). */
export function selectPhotoUrls(
  photos: SalePhoto[],
  max = visionMaxPhotos()
): string[] {
  const scored = photos
    .map((p) => {
      const url = preferFullUrl(p);
      const isData = /^data:image\//i.test(url);
      const isThumb =
        !isData &&
        (/thumb|tiny|small|_s\.|_xs\.|w=\d{1,3}|width=\d{1,3}/i.test(url) ||
          (p.width != null && p.width < 200));
      const area =
        p.width && p.height ? p.width * p.height : isThumb ? 0 : 500_000;
      return { url, area, isThumb };
    })
    .filter(
      (x) => x.url && (/^https?:\/\//i.test(x.url) || /^data:image\//i.test(x.url))
    );

  scored.sort((a, b) => {
    if (a.isThumb !== b.isThumb) return a.isThumb ? 1 : -1;
    return b.area - a.area;
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s.url);
    if (out.length >= max) break;
  }
  return out;
}

function parseEsnId(listing: SaleListing): string | null {
  const m = listing.id.match(/^esn:(\d+)$/);
  if (m) return m[1];
  const fromUrl = listing.url.match(/\/(\d+)(?:\/|$|\?)/);
  return fromUrl ? fromUrl[1] : null;
}

type EsnPicture = {
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
};

function picturesFromJson(raw: unknown): SalePhoto[] {
  const out: SalePhoto[] = [];
  const seen = new Set<string>();
  const push = (p?: EsnPicture | null) => {
    if (!p?.url || seen.has(p.url)) return;
    seen.add(p.url);
    out.push({
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      width: p.width,
      height: p.height,
    });
  };

  if (Array.isArray(raw)) {
    for (const sale of raw) {
      if (!sale || typeof sale !== "object") continue;
      const s = sale as Record<string, unknown>;
      push(s.mainPicture as EsnPicture);
      for (const p of (s.topPictures as EsnPicture[]) || []) push(p);
      for (const p of (s.pictures as EsnPicture[]) || []) push(p);
      for (const p of (s.allPictures as EsnPicture[]) || []) push(p);
    }
  } else if (raw && typeof raw === "object") {
    const s = raw as Record<string, unknown>;
    push(s.mainPicture as EsnPicture);
    for (const p of (s.topPictures as EsnPicture[]) || []) push(p);
    for (const p of (s.pictures as EsnPicture[]) || []) push(p);
  }
  return out;
}

function extractUrlsFromHtml(html: string): SalePhoto[] {
  const out: SalePhoto[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    const u = url.replace(/&amp;/g, "&").trim();
    if (!u || seen.has(u)) return;
    if (!/^https?:\/\//i.test(u)) return;
    // Skip logos / icons / sprites
    if (/logo|sprite|icon|favicon|avatar|pixel|1x1/i.test(u)) return;
    if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) && !/estatesales\.net/i.test(u)) {
      return;
    }
    seen.add(u);
    out.push({ url: u });
  };

  const og = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (og?.[1]) push(og[1]);

  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    push(m[1]);
    if (out.length >= 24) break;
  }

  // JSON-LD / inline gallery URLs often look like cdn paths
  const cdnRe =
    /https?:\/\/[^"'\s]+estatesales\.net[^"'\s]+\.(?:jpe?g|png|webp)/gi;
  let c: RegExpExecArray | null;
  while ((c = cdnRe.exec(html))) {
    push(c[0]);
    if (out.length >= 30) break;
  }

  return out;
}

async function fetchEsnById(saleId: string): Promise<SalePhoto[]> {
  const filter = `byid:${saleId}`;
  const url =
    `${ESN_BASE}/api/sale-details?filter=${encodeURIComponent(filter)}` +
    `&include=mainPicture,topPictures,pictures`;
  const { body, status } = await fetchCached(url, {
    rateKey: "esn-detail",
    ttlMs: 10 * 60 * 1000,
    headers: { Accept: "application/json" },
  });
  if (status < 200 || status >= 300) return [];
  try {
    return picturesFromJson(JSON.parse(body));
  } catch {
    return [];
  }
}

async function fetchSalePagePhotos(pageUrl: string): Promise<SalePhoto[]> {
  const { body, status, contentType } = await fetchCached(pageUrl, {
    rateKey: "esn-html",
    ttlMs: 10 * 60 * 1000,
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (status < 200 || status >= 300) return [];
  if (contentType && !/html|text|xml/i.test(contentType) && !body.includes("<img")) {
    return [];
  }
  return extractUrlsFromHtml(body);
}

/**
 * Merge extra photos onto a listing copy when it has few images.
 * Never throws; returns original listing on failure.
 */
export async function enrichListingPhotos(
  listing: SaleListing
): Promise<SaleListing> {
  const threshold = visionEnrichBelowPhotoCount();
  if ((listing.photos?.length || 0) >= threshold) {
    return listing;
  }

  try {
    const extra: SalePhoto[] = [];
    if (listing.sourceId === "estatesales.net") {
      const id = parseEsnId(listing);
      if (id) {
        const fromApi = await fetchEsnById(id);
        extra.push(...fromApi);
      }
      if (extra.length < threshold && listing.url) {
        const fromHtml = await fetchSalePagePhotos(listing.url);
        extra.push(...fromHtml);
      }
    } else if (listing.url) {
      const fromHtml = await fetchSalePagePhotos(listing.url);
      extra.push(...fromHtml);
    }

    if (extra.length === 0) return listing;

    const seen = new Set((listing.photos || []).map((p) => p.url));
    const merged = [...(listing.photos || [])];
    for (const p of extra) {
      if (!p.url || seen.has(p.url)) continue;
      seen.add(p.url);
      merged.push(p);
    }
    return { ...listing, photos: merged };
  } catch {
    return listing;
  }
}
