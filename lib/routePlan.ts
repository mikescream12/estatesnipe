export type RouteStop = {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  title?: string | null;
};

export const MAX_MAPS_STOPS = 9;

export function stopLabel(stop: RouteStop): string | null {
  const lat = stop.latitude;
  const lng = stop.longitude;
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat},${lng}`;
  }
  const parts = [stop.city, stop.state, stop.zip]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Google Maps directions for up to 9 stops. Null when fewer than 2 places resolve. */
export function buildMultiStopMapsUrl(stops: RouteStop[]): string | null {
  const labels: string[] = [];
  for (const stop of stops) {
    const label = stopLabel(stop);
    if (!label) continue;
    labels.push(label);
    if (labels.length >= MAX_MAPS_STOPS) break;
  }
  if (labels.length < 2) return null;
  const destination = labels[labels.length - 1];
  const waypoints = labels.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
}

export function buildSingleStopMapsUrl(stop: RouteStop): string | null {
  const label = stopLabel(stop);
  if (!label) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(label)}&travelmode=driving`;
}
