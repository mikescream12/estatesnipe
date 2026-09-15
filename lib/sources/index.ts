import { estatesalesNet } from "./estatesalesNet";
import { estatesalesOrg } from "./estatesalesOrg";
import { facebookMarketplace } from "./facebookMarketplace";
import { resolveZip } from "./geo";
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

export async function fetchAllSources(
  params: SourceFetchParams
): Promise<{ listings: SaleListing[]; statuses: SourceStatus[] }> {
  // Resolve geo once and share across sources
  const geo = await resolveZip(params.zip);
  const enriched: SourceFetchParams = {
    ...params,
    latitude: params.latitude ?? geo?.latitude,
    longitude: params.longitude ?? geo?.longitude,
    city: params.city ?? geo?.city,
    state: params.state ?? geo?.state,
  };

  // Sequential to respect global rate limits (sources also self-limit)
  const results: SourceFetchResult[] = [];
  for (const source of sources) {
    results.push(await source.fetch(enriched));
  }

  const listings = results.flatMap((r) => r.listings);
  const statuses = results.map((r) => r.status);
  return { listings, statuses };
}
