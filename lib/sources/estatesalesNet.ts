/**
 * Primary source: estatesales.net public JSON API (`/api/sale-details`).
 * Discovered filter format: filter=withorigin:lat_lng|bydistance:N|take:M&include=...
 * Be respectful: User-Agent + rate limit + response cache.
 */

import { fetchCached } from "./http";
import {
  haversineMiles,
  normalizeState,
  parseUrlLocation,
  resolveZip,
  stateForZip,
  statesCanBeNear,
} from "./geo";
import type {
  SaleListing,
  SalePhoto,
  SaleSource,
  SourceFetchParams,
  SourceFetchResult,
} from "./types";

type EsnPicture = {
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
};

type EsnSale = {
  id: number;
  name?: string;
  url?: string;
  cityName?: string;
  stateCode?: string;
  postalCodeNumber?: string;
  latitude?: number;
  longitude?: number;
  typeName?: string;
  description?: string | null;
  plainTextDescriptionLength?: number;
  mainPicture?: EsnPicture | null;
  topPictures?: EsnPicture[] | null;
  dates?: Array<{
    utcStartDate?: string;
    utcEndDate?: string;
    localStartDate?: string;
    localEndDate?: string;
  }> | null;
  firstUtcStartDate?: string;
  lastUtcEndDate?: string;
};

const BASE = "https://www.estatesales.net";

function isAuctionType(typeName?: string): boolean {
  if (!typeName) return false;
  return /auction/i.test(typeName);
}

function photosFrom(sale: EsnSale): SalePhoto[] {
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
  push(sale.mainPicture);
  for (const p of sale.topPictures || []) push(p);
  return out;
}

function mapSale(
  sale: EsnSale,
  origin?: { lat: number; lng: number }
): SaleListing {
  const path = sale.url?.startsWith("http")
    ? sale.url
    : `${BASE}${sale.url || ""}`;
  const start =
    sale.dates?.[0]?.utcStartDate || sale.firstUtcStartDate || null;
  const end = sale.dates?.[0]?.utcEndDate || sale.lastUtcEndDate || null;
  let distanceMiles: number | null = null;
  if (
    origin &&
    typeof sale.latitude === "number" &&
    typeof sale.longitude === "number"
  ) {
    distanceMiles = Math.round(
      haversineMiles(origin.lat, origin.lng, sale.latitude, sale.longitude) * 10
    ) / 10;
  }
  return {
    id: `esn:${sale.id}`,
    sourceId: "estatesales.net",
    title: sale.name || `Sale #${sale.id}`,
    description: sale.description || "",
    url: path,
    startDate: start,
    endDate: end,
    city: sale.cityName || null,
    state: sale.stateCode || null,
    zip: sale.postalCodeNumber || null,
    latitude: sale.latitude ?? null,
    longitude: sale.longitude ?? null,
    distanceMiles,
    photos: photosFrom(sale),
    isAuction: isAuctionType(sale.typeName),
    rawType: sale.typeName || null,
    fetchedAt: new Date().toISOString(),
  };
}

export const estatesalesNet: SaleSource = {
  id: "estatesales.net",

  async fetch(params: SourceFetchParams): Promise<SourceFetchResult> {
    const started = Date.now();
    const limit = Math.min(params.limit ?? 40, 80);
    const radius = Math.max(1, Math.min(params.radiusMiles || 25, 100));

    try {
      let lat = params.latitude;
      let lng = params.longitude;
      if (lat == null || lng == null) {
        const geo = await resolveZip(params.zip);
        if (!geo) {
          return {
            listings: [],
            status: {
              sourceId: this.id,
              ok: false,
              listingCount: 0,
              reason: `Could not resolve zip ${params.zip} to coordinates`,
              durationMs: Date.now() - started,
            },
          };
        }
        lat = geo.latitude;
        lng = geo.longitude;
      }

      const filter = [
        `withorigin:${lat}_${lng}`,
        `bydistance:${radius}`,
        `take:${limit}`,
      ].join("|");
      const url =
        `${BASE}/api/sale-details?filter=${encodeURIComponent(filter)}` +
        `&include=mainPicture,dates,topPictures`;

      const { body, status, cached } = await fetchCached(url, {
        rateKey: "esn",
        ttlMs: 3 * 60 * 1000,
        headers: { Accept: "application/json" },
      });

      if (status < 200 || status >= 300) {
        return {
          listings: [],
          status: {
            sourceId: this.id,
            ok: false,
            listingCount: 0,
            reason: `HTTP ${status} from estatesales.net`,
            cached,
            durationMs: Date.now() - started,
          },
        };
      }

      const raw = JSON.parse(body) as EsnSale[] | { message?: string };
      if (!Array.isArray(raw)) {
        return {
          listings: [],
          status: {
            sourceId: this.id,
            ok: false,
            listingCount: 0,
            reason:
              typeof raw === "object" && raw && "message" in raw
                ? String(raw.message)
                : "Unexpected JSON shape",
            cached,
            durationMs: Date.now() - started,
          },
        };
      }

      const originState = normalizeState(params.state);
      // bydistance is not a hard cap. No coordinates, no distance, or a
      // state/zip/url that cannot be near the watch → drop. Never keep
      // "unknown distance" for a later nationwide match.
      const listings = raw
        .map((s) => mapSale(s, { lat: lat!, lng: lng! }))
        .filter((l) => {
          if (
            l.distanceMiles == null ||
            !Number.isFinite(l.distanceMiles) ||
            l.distanceMiles > radius
          ) {
            return false;
          }
          if (!originState) return true;
          const url = parseUrlLocation(l.url);
          const signals = [
            normalizeState(l.state),
            stateForZip(l.zip) || "",
            normalizeState(url.state),
            stateForZip(url.zip) || "",
          ].filter(Boolean);
          return signals.every((st) => statesCanBeNear(originState, st));
        });
      return {
        listings,
        status: {
          sourceId: this.id,
          ok: true,
          listingCount: listings.length,
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
