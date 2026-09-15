/**
 * Secondary source: estatesales.org public HTML city pages.
 * Pattern: /estate-sales/{state}/{city-slug} e.g. /estate-sales/tx/dallas
 * NOTE: NOT estatelsaes.org (typo).
 */

import { citySlug, resolveZip } from "./geo";
import { fetchCached } from "./http";
import type {
  SaleListing,
  SalePhoto,
  SaleSource,
  SourceFetchParams,
  SourceFetchResult,
} from "./types";

const BASE = "https://estatesales.org";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseListings(html: string, limit: number): SaleListing[] {
  const listings: SaleListing[] = [];
  const seen = new Set<string>();

  // Card image + link pattern
  const cardRe =
    /<a class="card__image"[^>]*href="(\/estate-sales\/([a-z]{2})\/([^/]+)\/(\d{5})\/([^"]+)-(\d+))"[^>]*>[\s\S]*?(?:data-original|src)="(https?:\/\/[^"]+)"[\s\S]*?<img[^>]*alt="([^"]*)"/gi;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const [, path, state, , zip, , id, imgUrl, alt] = m;
    const sid = `eso:${id}`;
    if (seen.has(sid)) continue;
    seen.add(sid);

    const title = decodeEntities(alt || path.split("/").pop() || `Sale ${id}`);
    const photos: SalePhoto[] = imgUrl
      ? [{ url: imgUrl, thumbnailUrl: imgUrl }]
      : [];

    // Prefer non-"Online auction" / "In-person" generic titles from nearby heading links
    listings.push({
      id: sid,
      sourceId: "estatesales.org",
      title,
      description: "",
      url: `${BASE}${path}`,
      city: null,
      state: state.toUpperCase(),
      zip,
      photos,
      isAuction: /auction/i.test(title),
      fetchedAt: new Date().toISOString(),
    });
    if (listings.length >= limit) break;
  }

  // Fallback: title links if card parser missed
  if (listings.length === 0) {
    const linkRe =
      /href="(\/estate-sales\/([a-z]{2})\/[^/]+\/(\d{5})\/([^"]+)-(\d+))"[^>]*>([^<]{8,120})</gi;
    while ((m = linkRe.exec(html)) !== null) {
      const [, path, state, zip, , id, titleRaw] = m;
      const title = decodeEntities(titleRaw.trim());
      if (/^(online auction|in-person estate sale)$/i.test(title)) continue;
      const sid = `eso:${id}`;
      if (seen.has(sid)) continue;
      seen.add(sid);
      listings.push({
        id: sid,
        sourceId: "estatesales.org",
        title,
        description: "",
        url: `${BASE}${path}`,
        state: state.toUpperCase(),
        zip,
        photos: [],
        isAuction: /auction/i.test(title),
        fetchedAt: new Date().toISOString(),
      });
      if (listings.length >= limit) break;
    }
  }

  return listings;
}

export const estatesalesOrg: SaleSource = {
  id: "estatesales.org",

  async fetch(params: SourceFetchParams): Promise<SourceFetchResult> {
    const started = Date.now();
    const limit = Math.min(params.limit ?? 40, 80);

    try {
      let city = params.city;
      let state = params.state;
      if (!city || !state) {
        const geo = await resolveZip(params.zip);
        if (!geo?.city || !geo.state) {
          return {
            listings: [],
            status: {
              sourceId: this.id,
              ok: false,
              listingCount: 0,
              reason: `Could not resolve zip ${params.zip} to city/state`,
              durationMs: Date.now() - started,
            },
          };
        }
        city = geo.city;
        state = geo.state;
      }

      const slug = citySlug(city);
      const url = `${BASE}/estate-sales/${state.toLowerCase()}/${slug}`;
      const { body, status, cached } = await fetchCached(url, {
        rateKey: "eso",
        ttlMs: 5 * 60 * 1000,
        headers: { Accept: "text/html" },
      });

      if (status === 404) {
        return {
          listings: [],
          status: {
            sourceId: this.id,
            ok: true,
            listingCount: 0,
            reason: `No city page at ${url}`,
            cached,
            durationMs: Date.now() - started,
          },
        };
      }
      if (status < 200 || status >= 300) {
        return {
          listings: [],
          status: {
            sourceId: this.id,
            ok: false,
            listingCount: 0,
            reason: `HTTP ${status} from estatesales.org`,
            cached,
            durationMs: Date.now() - started,
          },
        };
      }

      const listings = parseListings(body, limit);
      return {
        listings,
        status: {
          sourceId: this.id,
          ok: true,
          listingCount: listings.length,
          reason: listings.length ? undefined : "Parsed 0 sale cards",
          cached,
          durationMs: Date.now() - started,
        },
      };
    } catch (err) {
      return {
        listings: [],
        status: {
          sourceId: this.id,
          ok: false,
          listingCount: 0,
          reason: err instanceof Error ? err.message : "Fetch failed",
          durationMs: Date.now() - started,
        },
      };
    }
  },
};
