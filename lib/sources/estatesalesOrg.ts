/**
 * Secondary source: estatesales.org public HTML city pages.
 * Pattern: /estate-sales/{state}/{city-slug} e.g. /estate-sales/tx/dallas
 * NOTE: NOT estatelsaes.org (typo).
 */

import {
  citySlug,
  normalizeState,
  parseUrlLocation,
  resolveZip,
  stateForZip,
  statesCanBeNear,
} from "./geo";
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

  const linkRe =
    /href="(\/estate-sales\/([a-z]{2})\/([^/]+)\/(\d{5})\/([^"]+)-(\d+))"/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const [, path, state, cityPart, zip, slug, id] = m;
    const sid = `eso:${id}`;
    if (seen.has(sid)) continue;

    const idx = m.index;
    const window = html.slice(Math.max(0, idx - 250), idx + 1000);
    const altMatch = /alt="([^"]{6,160})"/i.exec(window);
    let title = decodeEntities((altMatch?.[1] || "").trim());
    if (!title || /^(online auction|in-person estate sale)$/i.test(title)) {
      title = decodeEntities((slug || "").replace(/-/g, " "));
    }
    if (!title) title = `Sale ${id}`;

    const imgMatch =
      /data-original="(https?:\/\/[^"]+)"/i.exec(window) ||
      /src="(https?:\/\/eso-cdn[^"]+)"/i.exec(window);
    const photos: SalePhoto[] = imgMatch
      ? [{ url: imgMatch[1], thumbnailUrl: imgMatch[1] }]
      : [];

    seen.add(sid);
    listings.push({
      id: sid,
      sourceId: "estatesales.org",
      title: title.slice(0, 200),
      description: "",
      url: `${BASE}${path}`,
      city: cityPart.replace(/-/g, " ").replace(/\s+$/g, "") || null,
      state: state.toUpperCase(),
      zip,
      photos,
      isAuction: /auction/i.test(title),
      fetchedAt: new Date().toISOString(),
    });
    if (listings.length >= limit) break;
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
        timeoutMs: params.timeoutMs ?? 14_000,
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

      const watchState = normalizeState(state);
      // City pages embed featured sales, sometimes in other states. Drop
      // anything that cannot sit inside the soft band. Same-state but far
      // zips are still distance-checked by the scan gate.
      const listings = parseListings(body, limit).filter((l) => {
        if (!watchState) return false;
        const url = parseUrlLocation(l.url);
        const signals = [
          normalizeState(l.state),
          stateForZip(l.zip) || "",
          normalizeState(url.state),
          stateForZip(url.zip) || "",
        ].filter(Boolean);
        if (!signals.length) return false;
        return signals.every((st) => statesCanBeNear(watchState, st));
      });
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
