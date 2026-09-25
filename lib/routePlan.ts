/**
 * Google Maps directions helpers for single-sale and multi-stop routing.
 * Keep URL construction out of JSX.
 */

export const MAX_MAPS_STOPS = 9;

export type RouteStop = {
  title?: string | null;
  distanceMiles?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

/** Match shape used when ordering a driving loop (score lives on the match). */
export type RouteMatchLike = {
  score?: number | null;
  listing: RouteStop;
};

/** Destination param: lat,lng when known, else city/state/zip address string. */
export function destinationForStop(stop: RouteStop): string | null {
  const lat = stop.latitude;
  const lng = stop.longitude;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return `${lat},${lng}`;
  }
  const parts = [stop.city, stop.state, stop.zip]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

/** Single-sale Google Maps directions (driving). Origin = device location. */
export function buildSingleStopMapsUrl(stop: RouteStop): string | null {
  const dest = destinationForStop(stop);
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    dest
  )}&travelmode=driving`;
}

/**
 * Preference-weighted stop order for a multi-sale driving loop:
 * higher match score first, then nearer distanceMiles, then title.
 * Drops stops with no destination. Does not cap — caller / buildMultiStopMapsUrl caps.
 */
export function sortStopsForRoute<T extends RouteMatchLike>(matches: T[]): T[] {
  return [...matches]
    .filter((m) => destinationForStop(m.listing) != null)
    .sort((a, b) => {
      const scoreA = typeof a.score === "number" && Number.isFinite(a.score) ? a.score : -Infinity;
      const scoreB = typeof b.score === "number" && Number.isFinite(b.score) ? b.score : -Infinity;
      if (scoreB !== scoreA) return scoreB - scoreA;

      const distA =
        typeof a.listing.distanceMiles === "number" &&
        Number.isFinite(a.listing.distanceMiles)
          ? a.listing.distanceMiles
          : Infinity;
      const distB =
        typeof b.listing.distanceMiles === "number" &&
        Number.isFinite(b.listing.distanceMiles)
          ? b.listing.distanceMiles
          : Infinity;
      if (distA !== distB) return distA - distB;

      const titleA = String(a.listing.title || "");
      const titleB = String(b.listing.title || "");
      return titleA.localeCompare(titleB);
    });
}

/**
 * Multi-stop Maps URL. Origin omitted (device location).
 * waypoints = all but last (pipe-separated), destination = last.
 * Caps at MAX_MAPS_STOPS (9). Needs 2+ stops with destinations.
 */
export function buildMultiStopMapsUrl(stops: RouteStop[]): string | null {
  const dests: string[] = [];
  for (const stop of stops) {
    const d = destinationForStop(stop);
    if (d) dests.push(d);
    if (dests.length >= MAX_MAPS_STOPS) break;
  }
  if (dests.length < 2) return null;

  const destination = dests[dests.length - 1];
  const waypoints = dests.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
}
