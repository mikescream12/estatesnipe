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

/** Default per-source budget so a hung site cannot burn the whole Hobby 60s. */
export const DEFAULT_SOURCE_TIMEOUT_MS = 14_000;

function unverified(zip: string): SourceStatus[] {
  return sources.map((s) => ({
    sourceId: s.id,
    ok: false,
    listingCount: 0,
    reason: `Could not verify zip ${zip} — no sales returned`,
  }));
}

function timeoutResult(
  source: SaleSource,
  started: number,
  ms: number
): SourceFetchResult {
  return {
    listings: [],
    status: {
      sourceId: source.id,
      ok: false,
      listingCount: 0,
      reason: `Source timed out after ${ms}ms`,
      durationMs: Date.now() - started,
    },
  };
}

async function fetchSourceWithTimeout(
  source: SaleSource,
  params: SourceFetchParams,
  timeoutMs: number
): Promise<SourceFetchResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      source.fetch(params),
      new Promise<SourceFetchResult>((resolve) => {
        timer = setTimeout(
          () => resolve(timeoutResult(source, started, timeoutMs)),
          timeoutMs
        );
      }),
    ]);
  } catch (err) {
    return {
      listings: [],
      status: {
        sourceId: source.id,
        ok: false,
        listingCount: 0,
        reason: err instanceof Error ? err.message : "Fetch failed",
        durationMs: Date.now() - started,
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchAllSources(
  params: SourceFetchParams
): Promise<{
  listings: SaleListing[];
  statuses: SourceStatus[];
  partial?: boolean;
}> {
  let latitude = params.latitude;
  let longitude = params.longitude;
  let city = params.city;
  let state = params.state;

  if (latitude == null || longitude == null || !city || !state) {
    const geo = await resolveZip(params.zip, { crossCheck: true });
    if (!geo) {
      return { listings: [], statuses: unverified(params.zip) };
    }
    latitude = latitude ?? geo.latitude;
    longitude = longitude ?? geo.longitude;
    city = city ?? geo.city;
    state = state ?? geo.state;
  }

  const timeoutMs = Math.min(
    30_000,
    Math.max(3_000, params.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS)
  );
  const enriched: SourceFetchParams = {
    ...params,
    latitude,
    longitude,
    city,
    state,
    timeoutMs,
  };

  // Parallel: each source has its own rate key; facebook stub is instant.
  const results = await Promise.all(
    sources.map((source) => fetchSourceWithTimeout(source, enriched, timeoutMs))
  );
  const anyTimedOut = results.some((r) =>
    (r.status.reason || "").includes("timed out")
  );

  const raw = results.flatMap((r) => r.listings);
  const hard = params.hardRadiusMiles ?? params.radiusMiles;
  const kept = await filterListingsByWatchGeo(raw, params.zip, hard);
  const allowed = new Set(kept.map((k) => k.listing.id));
  const listings = raw.filter((l) => allowed.has(l.id));

  const statuses = results.map((r) => ({
    ...r.status,
    listingCount: r.listings.filter((l) => allowed.has(l.id)).length,
  }));
  return {
    listings,
    statuses,
    ...(anyTimedOut ? { partial: true } : {}),
  };
}
