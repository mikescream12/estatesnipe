import { fetchCached } from "./http";

export type GeoResult = {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string; // 2-letter
};

/** Prefer EstateSales.NET postal-code-details; fall back to Zippopotam.us */
export async function resolveZip(zip: string): Promise<GeoResult | null> {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;

  try {
    const url = `https://www.estatesales.net/api/postal-code-details?filter=byfield:postalcodenumber_${clean}`;
    const { body, status } = await fetchCached(url, {
      rateKey: "esn",
      ttlMs: 24 * 60 * 60 * 1000,
      headers: { Accept: "application/json" },
    });
    if (status >= 200 && status < 300) {
      const arr = JSON.parse(body) as Array<{
        postalCodeNumber?: string;
        latitude?: number;
        longitude?: number;
        cityName?: string;
        stateCode?: string;
      }>;
      const hit = Array.isArray(arr)
        ? arr.find((x) => x.postalCodeNumber === clean) || arr[0]
        : null;
      if (hit?.latitude != null && hit?.longitude != null) {
        return {
          zip: clean,
          latitude: hit.latitude,
          longitude: hit.longitude,
          city: hit.cityName || "",
          state: (hit.stateCode || "").toLowerCase(),
        };
      }
    }
  } catch {
    // fall through
  }

  try {
    const { body, status } = await fetchCached(
      `https://api.zippopotam.us/us/${clean}`,
      { rateKey: "zippopotam", ttlMs: 24 * 60 * 60 * 1000 }
    );
    if (status >= 200 && status < 300) {
      const data = JSON.parse(body) as {
        places?: Array<{
          latitude: string;
          longitude: string;
          "place name": string;
          "state abbreviation": string;
        }>;
      };
      const place = data.places?.[0];
      if (place) {
        return {
          zip: clean,
          latitude: parseFloat(place.latitude),
          longitude: parseFloat(place.longitude),
          city: place["place name"],
          state: place["state abbreviation"].toLowerCase(),
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** slugify city for estatesales.org paths: "Fort Worth" -> "fort-worth" */
export function citySlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
