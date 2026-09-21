/**
 * Pure location rules. No network, no Node APIs — safe for the client.
 *
 * A sale is shown only when a verified distance (coordinates or structured
 * sale zip) is inside the hard radius or the small soft band. Text in a
 * title never counts as location. A zip in the chat message never overrides
 * a zip the user already typed. Far states (TX vs CA) are out even if a
 * source claims a tiny distance.
 */

export const DEFAULT_RADIUS_MI = 25;
export const MAX_RADIUS_MI = 100;

export type DistanceBand = "in" | "near" | "out";

const STATE_NAMES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", "district of columbia": "dc",
  florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il",
  indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la",
  maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi",
  minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt",
  nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc",
  "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut",
  vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv",
  wisconsin: "wi", wyoming: "wy",
};

/** Inclusive ZIP3 ranges → state. Unknown prefixes return null (not a free pass). */
const ZIP3_RANGES = `
005-005:ny
006-007:pr
008-008:vi
009-009:pr
010-027:ma
028-029:ri
030-038:nh
039-049:me
050-054:vt
055-055:ma
056-059:vt
060-069:ct
070-089:nj
100-149:ny
150-196:pa
197-199:de
200-200:dc
201-201:va
202-205:dc
206-219:md
220-246:va
247-268:wv
270-289:nc
290-299:sc
300-319:ga
320-339:fl
341-349:fl
350-369:al
370-385:tn
386-397:ms
398-399:ga
400-427:ky
430-459:oh
460-479:in
480-499:mi
500-528:ia
530-549:wi
550-567:mn
570-577:sd
580-588:nd
590-599:mt
600-629:il
630-658:mo
660-679:ks
680-693:ne
700-714:la
716-729:ar
730-731:ok
733-733:tx
734-741:ok
743-749:ok
750-799:tx
800-816:co
820-831:wy
832-838:id
840-847:ut
850-865:az
870-884:nm
885-885:tx
889-898:nv
900-908:ca
910-928:ca
930-961:ca
967-968:hi
970-979:or
980-994:wa
995-999:ak
`.trim();

const ZIP3: Array<[number, number, string]> = ZIP3_RANGES.split("\n").map((line) => {
  const [span, st] = line.split(":");
  const [a, b] = span.split("-");
  return [Number(a), Number(b), st];
});

const NEIGHBORS: Record<string, string[]> = {
  al: ["fl", "ga", "ms", "tn"],
  az: ["ca", "nv", "ut", "co", "nm"],
  ar: ["mo", "tn", "ms", "la", "tx", "ok"],
  ca: ["or", "nv", "az"],
  co: ["wy", "ne", "ks", "ok", "nm", "az", "ut"],
  ct: ["ny", "ma", "ri"],
  de: ["md", "pa", "nj"],
  dc: ["md", "va"],
  fl: ["al", "ga"],
  ga: ["fl", "al", "tn", "nc", "sc"],
  id: ["wa", "or", "nv", "ut", "wy", "mt"],
  il: ["wi", "in", "ky", "mo", "ia"],
  in: ["mi", "oh", "ky", "il"],
  ia: ["mn", "wi", "il", "mo", "ne", "sd"],
  ks: ["ne", "mo", "ok", "co"],
  ky: ["il", "in", "oh", "wv", "va", "tn", "mo"],
  la: ["tx", "ar", "ms"],
  me: ["nh"],
  md: ["va", "wv", "pa", "de", "dc"],
  ma: ["ri", "ct", "ny", "vt", "nh"],
  mi: ["oh", "in", "wi"],
  mn: ["wi", "ia", "sd", "nd"],
  ms: ["la", "ar", "tn", "al"],
  mo: ["ia", "il", "ky", "tn", "ar", "ok", "ks", "ne"],
  mt: ["id", "wy", "sd", "nd"],
  ne: ["sd", "ia", "mo", "ks", "co", "wy"],
  nv: ["or", "id", "ut", "az", "ca"],
  nh: ["me", "vt", "ma"],
  nj: ["ny", "pa", "de"],
  nm: ["az", "ut", "co", "ok", "tx"],
  ny: ["vt", "ma", "ct", "nj", "pa"],
  nc: ["va", "tn", "ga", "sc"],
  nd: ["mn", "sd", "mt"],
  oh: ["mi", "in", "ky", "wv", "pa"],
  ok: ["ks", "mo", "ar", "tx", "nm", "co"],
  or: ["wa", "id", "nv", "ca"],
  pa: ["ny", "nj", "de", "md", "wv", "oh"],
  ri: ["ct", "ma"],
  sc: ["nc", "ga"],
  sd: ["nd", "mn", "ia", "ne", "wy", "mt"],
  tn: ["ky", "va", "nc", "ga", "al", "ms", "ar", "mo"],
  tx: ["nm", "ok", "ar", "la"],
  ut: ["id", "wy", "co", "nm", "az", "nv"],
  vt: ["nh", "ma", "ny"],
  va: ["md", "dc", "nc", "tn", "ky", "wv"],
  wa: ["or", "id"],
  wv: ["oh", "pa", "md", "va", "ky"],
  wi: ["mn", "ia", "il", "mi"],
  wy: ["mt", "sd", "ne", "co", "ut", "id"],
};

export function normalizeState(state: string | null | undefined): string {
  const raw = (state || "").trim().toLowerCase().replace(/\./g, "");
  if (!raw) return "";
  if (STATE_NAMES[raw]) return STATE_NAMES[raw];
  if (/^[a-z]{2}$/.test(raw)) return raw;
  return "";
}

export function isFiveDigitZip(zip: string | null | undefined): boolean {
  return /^\d{5}$/.test((zip || "").trim());
}

export function stateForZip(zip: string | null | undefined): string | null {
  const z = (zip || "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return null;
  const n = Number(z.slice(0, 3));
  for (const [a, b, st] of ZIP3) {
    if (n >= a && n <= b) return st;
  }
  return null;
}

/** Same state, or a bordering state that can fall inside a ≤100 mi soft band. */
export function statesCanBeNear(a: string, b: string): boolean {
  const x = normalizeState(a);
  const y = normalizeState(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return (NEIGHBORS[x] || []).includes(y);
}

export function clampRadiusMiles(value: unknown, fallback = DEFAULT_RADIUS_MI): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(MAX_RADIUS_MI, n));
}

/** Soft near-miss ceiling: max(radius * 1.25, radius + 5). */
export function softMaxMiles(radiusMi: number): number {
  const r = clampRadiusMiles(radiusMi, DEFAULT_RADIUS_MI);
  return Math.max(r * 1.25, r + 5);
}

export function classifyDistanceMiles(
  distanceMiles: number,
  radiusMi: number
): DistanceBand {
  const radius = clampRadiusMiles(radiusMi, DEFAULT_RADIUS_MI);
  if (!Number.isFinite(distanceMiles) || distanceMiles < 0) return "out";
  if (distanceMiles <= radius) return "in";
  if (distanceMiles <= softMaxMiles(radius)) return "near";
  return "out";
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

export function roundMiles(n: number): number {
  return Math.round(n * 10) / 10;
}

/** US lat/lng, not null-island, not a copied placeholder. */
export function validSaleCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 15 || lat > 72 || lng < -180 || lng > -64) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false;
  return true;
}

/**
 * The zip field wins. A zip buried in the query is used only when the
 * field is empty. Never invent a default zip.
 */
export function preferredZip(fieldZip: string, textZip: string | null | undefined): string {
  const field = (fieldZip || "").replace(/\D/g, "").slice(0, 5);
  if (/^\d{5}$/.test(field)) return field;
  const text = (textZip || "").replace(/\D/g, "").slice(0, 5);
  if (/^\d{5}$/.test(text)) return text;
  return "";
}

export type UrlLocation = { state: string | null; zip: string | null };

/** Structured location from a sale link. Does not read listing titles. */
export function parseUrlLocation(url: string | null | undefined): UrlLocation {
  if (!url) return { state: null, zip: null };
  const u = url.trim();
  let state: string | null = null;
  let zip: string | null = null;

  const eso = u.match(/\/estate-sales\/([a-zA-Z]{2})\/[^/?#]+\/(\d{5})(?:\/|$|\?|#)/i);
  if (eso) {
    state = eso[1].toLowerCase();
    zip = eso[2];
  }

  const path = u.match(/\/([a-zA-Z]{2})\/[^/?#]+\/(\d{5})(?:\/|$|\?|#)/);
  if (path) {
    if (!state) state = path[1].toLowerCase();
    if (!zip) zip = path[2];
  }

  const q = u.match(/[?&](?:zip|postal(?:code)?|postalcodenumber)=(\d{5})\b/i);
  if (q) zip = q[1];

  const fb = u.match(/marketplace\/(\d{5})\b/i);
  if (fb) zip = fb[1];

  return { state, zip };
}

export type GateInput = {
  origin: { zip: string; state: string; city?: string };
  radiusMi: number;
  /** Miles from sale lat/lng. Not a source-claimed distance and not a text zip. */
  coordDistanceMiles: number | null;
  /** Miles from the structured sale zip (URL or listing.zip), if geocoded. */
  zipDistanceMiles?: number | null;
  listingState?: string | null;
  listingZip?: string | null;
  listingUrl?: string | null;
};

export type GateDecision = {
  include: boolean;
  outsideRadius: boolean;
  band: DistanceBand;
  distanceMiles: number | null;
};

function finiteMiles(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Fail closed. Title text is not an input on purpose — a Texas zip in a
 * title cannot place the sale. Zip-string equality with the watch zip is
 * not a hard match.
 */
export function gateListing(args: GateInput): GateDecision {
  const out = (distanceMiles: number | null = null): GateDecision => ({
    include: false,
    outsideRadius: false,
    band: "out",
    distanceMiles,
  });

  const radiusMi = clampRadiusMiles(args.radiusMi, DEFAULT_RADIUS_MI);
  const originState =
    normalizeState(args.origin.state) || stateForZip(args.origin.zip) || "";
  if (!originState || !isFiveDigitZip(args.origin.zip)) return out();

  const url = parseUrlLocation(args.listingUrl);
  const signals = [
    normalizeState(args.listingState),
    stateForZip(args.listingZip) || "",
    normalizeState(url.state),
    stateForZip(url.zip) || "",
  ].filter(Boolean);

  const unique = Array.from(new Set(signals));
  if (unique.length > 1) return out();

  const placeState = unique[0] || "";
  if (placeState && !statesCanBeNear(originState, placeState)) return out();

  const coord = finiteMiles(args.coordDistanceMiles);
  const zipD = finiteMiles(args.zipDistanceMiles);
  if (coord != null && zipD != null && Math.abs(coord - zipD) > 50) return out();

  const distanceMiles = coord ?? zipD;
  if (distanceMiles == null) return out();

  if (!placeState) return out();

  const band = classifyDistanceMiles(distanceMiles, radiusMi);
  if (band === "out") return out(distanceMiles);
  return {
    include: true,
    outsideRadius: band === "near",
    band,
    distanceMiles,
  };
}
