import { estatesalesNet } from "./estatesalesNet";
import { estatesalesOrg } from "./estatesalesOrg";
import { facebookMarketplace } from "./facebookMarketplace";
import { resolveZip } from "./geo";
import { filterListingsByWatchGeo } from "../geoFilter";
import type {
  SaleListing,
  SaleSource,
  SourceFetchParams,
  SourceFetchResult,
  SourceStatus,
} from "./types";

export * from "./types";
export { resolveZip } from "./geo";

export const sources: SaleSource[] = [
  estatesalesNet,
  estatesalesOrg,
  facebookMarketplace,
];

function unverified(zip: string): SourceStatus[] {
  return sources.map((s) => ({
    sourceId: s.id,
    ok: false,
    listingCount: 0,
    reason: `Could not verify zip ${zip} — no sales returned`,
  }));
}

export async function fetchAllSources(
  params: SourceFetchParams
): Promise<{ listings: SaleListing[]; statuses: SourceStatus[] }> {
  const geo = await resolveZip(params.zip, { crossCheck: true });
  if (!geo) {
    return { listings: [], statuses: unverified(params.zip) };
  }

  const enriched: SourceFetchParams = {
    ...params,
    latitude: params.latitude ?? geo.latitude,
    longitude: params.longitude ?? geo.longitude,
    city: params.city ?? geo.city,
    state: params.state ?? geo.state,
  };

  // Sequential to respect global rate limits (sources also self-limit)
  const results: SourceFetchResult[] = [];
  for (const source of sources) {
    results.push(await source.fetch(enriched));
  }

  const raw = results.flatMap((r) => r.listings);
  const hard = params.hardRadiusMiles ?? params.radiusMiles;
  // Every source, including ones added later, passes this gate.
  const kept = await filterListingsByWatchGeo(raw, params.zip, hard);
  const allowed = new Set(kept.map((k) => k.listing.id));
  const listings = raw.filter((l) => allowed.has(l.id));

  const statuses = results.map((r) => ({
    ...r.status,
    listingCount: r.listings.filter((l) => allowed.has(l.id)).length,
  }));
  return { listings, statuses };
}
