/**
 * Post-fetch geo gate for EstateSnipe.
 *
 * Hard match: distanceMiles <= radiusMi
 * Near-miss (outsideRadius): radiusMi < distance <= softMax
 *   softMax = max(radiusMi * 1.25, radiusMi + 5)
 * Beyond softMax, unknown distance, state/zip/url conflicts: excluded.
 *
 * Location comes from sale coordinates or the structured sale zip / URL.
 * A zip in the listing title is ignored. Zip-string equality with the
 * watch zip is never a hard match (Houston must not match 92886).
 */

import { gateListing, type GateDecision } from "./geoPure";
import {
  haversineMiles,
  normalizeState,
  parseUrlLocation,
  resolveZip,
  roundMiles,
  stateForZip,
  statesCanBeNear,
  validSaleCoord,
  type GeoResult,
} from "./sources/geo";
import type { SaleListing } from "./sources/types";

export type GeoBandDecision = GateDecision;

export type GeoFilteredListing = {
  listing: SaleListing;
  distanceMiles: number | null;
  outsideRadius: boolean;
  band: "in" | "near";
};

export { softMaxMiles, classifyDistanceMiles, gateListing } from "./geoPure";

export function decideGeoBand(args: {
  distanceMiles: number | null;
  listingState?: string | null;
  listingZip?: string | null;
  listingCity?: string | null;
  listingUrl?: string | null;
  origin: Pick<GeoResult, "zip" | "state" | "city">;
  radiusMi: number;
}): GeoBandDecision {
  return gateListing({
    origin: args.origin,
    radiusMi: args.radiusMi,
    coordDistanceMiles: args.distanceMiles,
    zipDistanceMiles: null,
    listingState: args.listingState,
    listingZip: args.listingZip,
    listingUrl: args.listingUrl,
  });
}

function provenFar(originState: string, candidate: string): boolean {
  const st = normalizeState(candidate) || stateForZip(candidate) || "";
  if (!st || !originState) return false;
  return !statesCanBeNear(originState, st);
}

/**
 * Keep only in-radius + soft near-miss listings; attach outsideRadius flag.
 * Empty when the watch zip cannot be verified.
 */
export async function filterListingsByWatchGeo(
  listings: SaleListing[],
  watchZip: string,
  radiusMi: number
): Promise<GeoFilteredListing[]> {
  const origin = await resolveZip(watchZip, { crossCheck: true });
  if (!origin) return [];

  const originState = normalizeState(origin.state) || stateForZip(origin.zip) || "";
  if (!originState) return [];
  origin.state = originState;

  const out: GeoFilteredListing[] = [];

  for (const listing of listings) {
    const urlLoc = parseUrlLocation(listing.url);
    if (provenFar(originState, listing.state || "")) continue;
    if (provenFar(originState, listing.zip || "")) continue;
    if (provenFar(originState, urlLoc.state || "")) continue;
    if (provenFar(originState, urlLoc.zip || "")) continue;

    let coordDistanceMiles: number | null = null;
    if (
      typeof listing.latitude === "number" &&
      typeof listing.longitude === "number" &&
      validSaleCoord(listing.latitude, listing.longitude)
    ) {
      coordDistanceMiles = roundMiles(
        haversineMiles(
          origin.latitude,
          origin.longitude,
          listing.latitude,
          listing.longitude
        )
      );
    }

    // Structured sale zip only — never a zip scraped out of the title.
    let zipDistanceMiles: number | null = null;
    const structuredZip = (listing.zip || urlLoc.zip || "").trim().slice(0, 5);
    if (coordDistanceMiles == null && /^\d{5}$/.test(structuredZip)) {
      const geo = await resolveZip(structuredZip);
      if (geo) {
        if (provenFar(originState, geo.state)) continue;
        zipDistanceMiles = roundMiles(
          haversineMiles(
            origin.latitude,
            origin.longitude,
            geo.latitude,
            geo.longitude
          )
        );
      }
    }

    const decision = gateListing({
      origin,
      radiusMi,
      coordDistanceMiles,
      zipDistanceMiles,
      listingState: listing.state,
      listingZip: listing.zip || urlLoc.zip,
      listingUrl: listing.url,
    });
    if (!decision.include || decision.band === "out") continue;
    if (decision.distanceMiles != null) {
      listing.distanceMiles = decision.distanceMiles;
    }
    out.push({
      listing,
      distanceMiles: decision.distanceMiles,
      outsideRadius: decision.outsideRadius,
      band: decision.band,
    });
  }

  return out;
}
