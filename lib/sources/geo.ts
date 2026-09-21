import { fetchCached } from "./http";
import { haversineMiles, stateForZip, validSaleCoord } from "../geoPure";

export {
  clampRadiusMiles,
  classifyDistanceMiles,
  DEFAULT_RADIUS_MI,
  haversineMiles,
  isFiveDigitZip,
  MAX_RADIUS_MI,
  normalizeState,
  parseUrlLocation,
  preferredZip,
  roundMiles,
  softMaxMiles,
  stateForZip,
  statesCanBeNear,
  validSaleCoord,
} from "../geoPure";
export type { DistanceBand, UrlLocation } from "../geoPure";

export type GeoResult = {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string; // 2-letter
};

function acceptPoint(
  zip: string,
  lat: number,
  lng: number,
  state: string
): boolean {
  if (!validSaleCoord(lat, lng)) return false;
  const expected = stateForZip(zip);
  const st = (state || "").trim().toLowerCase().slice(0, 2);
  // 92886 must not resolve to Texas. Prefix and returned state have to agree.
  if (expected && st && expected !== st) return false;
  if (!st) return false;
  return true;
}

async function fromEstatesalesNet(clean: string): Promise<GeoResult | null> {
  try {
    const url = `https://www.estatesales.net/api/postal-code-details?filter=byfield:postalcodenumber_${clean}`;
    const { body, status } = await fetchCached(url, {
      rateKey: "esn",
      ttlMs: 24 * 60 * 60 * 1000,
      headers: { Accept: "application/json" },
    });
    if (status < 200 || status >= 300) return null;
    const arr = JSON.parse(body) as Array<{
      postalCodeNumber?: string | number;
      latitude?: number;
      longitude?: number;
      cityName?: string;
      stateCode?: string;
    }>;
    if (!Array.isArray(arr)) return null;
    // Exact postal code only. Never fall through to arr[0] (that mapped
    // unrelated zips, including Houston-class rows, onto the watch zip).
    const hit = arr.find(
      (x) => String(x.postalCodeNumber ?? "").trim().slice(0, 5) === clean
    );
    if (!hit || hit.latitude == null || hit.longitude == null) return null;
    const state = (hit.stateCode || "").toLowerCase();
    if (!acceptPoint(clean, hit.latitude, hit.longitude, state)) return null;
    return {
      zip: clean,
      latitude: hit.latitude,
      longitude: hit.longitude,
      city: hit.cityName || "",
      state,
    };
  } catch {
    return null;
  }
}

async function fromZippopotam(clean: string): Promise<GeoResult | null> {
  try {
    const { body, status } = await fetchCached(
      `https://api.zippopotam.us/us/${clean}`,
      { rateKey: "zippopotam", ttlMs: 24 * 60 * 60 * 1000 }
    );
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(body) as {
      places?: Array<{
        latitude: string;
        longitude: string;
        "place name": string;
        "state abbreviation": string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return null;
    const latitude = parseFloat(place.latitude);
    const longitude = parseFloat(place.longitude);
    const state = (place["state abbreviation"] || "").toLowerCase();
    if (!acceptPoint(clean, latitude, longitude, state)) return null;
    return {
      zip: clean,
      latitude,
      longitude,
      city: place["place name"],
      state,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a US zip. Fail closed if sources disagree by more than 40 miles
 * or the returned state does not match the zip prefix (Houston ≠ 92886).
 */
export async function resolveZip(
  zip: string,
  opts?: { crossCheck?: boolean }
): Promise<GeoResult | null> {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;

  if (opts?.crossCheck) {
    const [esn, zippo] = await Promise.all([
      fromEstatesalesNet(clean),
      fromZippopotam(clean),
    ]);
    if (esn && zippo) {
      const d = haversineMiles(
        esn.latitude,
        esn.longitude,
        zippo.latitude,
        zippo.longitude
      );
      if (d > 40) return null;
      if (esn.state && zippo.state && esn.state !== zippo.state) return null;
      return zippo;
    }
    return zippo || esn;
  }

  // Listing zips: Zippopotam first (stable), ESN only if that fails.
  const zippo = await fromZippopotam(clean);
  if (zippo) return zippo;
  return fromEstatesalesNet(clean);
}

/** slugify city for estatesales.org paths: "Fort Worth" -> "fort-worth" */
export function citySlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

