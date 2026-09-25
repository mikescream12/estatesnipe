/** Shared listing types for EstateSnipe sale sources. */

export type SourceId = "estatesales.net" | "estatesales.org" | "facebook";

export type SalePhoto = {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
};

export type SaleListing = {
  /** Stable id scoped by source, e.g. "esn:5072826" */
  id: string;
  sourceId: SourceId;
  title: string;
  description: string;
  url: string;
  /** ISO date strings when known */
  startDate?: string | null;
  endDate?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceMiles?: number | null;
  photos: SalePhoto[];
  /** True when listing looks like an auction (online/in-person) */
  isAuction?: boolean;
  rawType?: string | null;
  fetchedAt: string;
};

export type SourceStatus = {
  sourceId: SourceId;
  ok: boolean;
  listingCount: number;
  /** Human-readable reason when empty/failed (never throw from sources) */
  reason?: string;
  cached?: boolean;
  durationMs?: number;
};

export type SourceFetchParams = {
  zip: string;
  /** Window passed to source APIs (soft band). Not the user's hard radius. */
  radiusMiles: number;
  /**
   * User's hard radius for the geo gate. Defaults to radiusMiles.
   * Texas must stay out even if a source ignores radiusMiles.
   */
  hardRadiusMiles?: number;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  /** Soft cap per source */
  limit?: number;
  /** Wall-clock budget for this fetch (ms). Honored by fetchAllSources. */
  timeoutMs?: number;
};

export type SourceFetchResult = {
  listings: SaleListing[];
  status: SourceStatus;
};

export interface SaleSource {
  id: SourceId;
  fetch(params: SourceFetchParams): Promise<SourceFetchResult>;
}
