/**
 * eBay sold comps for flip research.
 * Without EBAY_APP_ID (and optional OAuth token), returns configured:false.
 * Never invents sell-through % or fake comps. API only — no HTML scrape.
 *
 * Env (when ready):
 *   EBAY_APP_ID          — Browse / Finding app id
 *   EBAY_OAUTH_TOKEN     — optional user/application token for Browse API
 *   EBAY_FINDING_URL     — optional override (default Finding API endpoint)
 */

export type SoldCompSummary = {
  configured: boolean;
  query?: string;
  /** Sold / completed listing count from API when available */
  soldCount?: number | null;
  /** Active listings count when available (for rough sell-through) */
  activeCount?: number | null;
  /**
   * Rough sell-through when both sold + active (or similar) are present.
   * Null when data is insufficient — never invent a percentage.
   */
  sellThroughPct?: number | null;
  /** Median sold price in USD when price data exists */
  medianSoldUsd?: number | null;
  /** Low/high sold band when enough prices */
  soldLowUsd?: number | null;
  soldHighUsd?: number | null;
  /** Short human note for UI */
  note?: string;
  error?: string;
};

function ebayAppId(): string {
  return (process.env.EBAY_APP_ID || "").trim();
}

function ebayOauthToken(): string {
  return (process.env.EBAY_OAUTH_TOKEN || process.env.EBAY_ACCESS_TOKEN || "").trim();
}

export function isEbayConfigured(): boolean {
  return Boolean(ebayAppId());
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Fetch sold comps for a query. Safe without secrets.
 */
export async function getSoldComps(
  query: string,
  options?: { timeoutMs?: number }
): Promise<SoldCompSummary> {
  const q = (query || "").trim().slice(0, 120);
  const appId = ebayAppId();
  if (!appId) {
    return {
      configured: false,
      query: q || undefined,
      note: "Comps: connect eBay to score sell-through",
    };
  }
  if (!q) {
    return {
      configured: true,
      query: "",
      sellThroughPct: null,
      note: "Empty query — no comps",
      error: "empty_query",
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8_000;
  const token = ebayOauthToken();

  // Prefer Browse API when OAuth token present; else Finding API with app id.
  try {
    if (token) {
      return await browseSoldSearch(q, appId, token, timeoutMs);
    }
    return await findingSoldSearch(q, appId, timeoutMs);
  } catch (err) {
    return {
      configured: true,
      query: q,
      sellThroughPct: null,
      note: "eBay comps unavailable right now",
      error: err instanceof Error ? err.message.slice(0, 180) : "ebay_error",
    };
  }
}

async function findingSoldSearch(
  query: string,
  appId: string,
  timeoutMs: number
): Promise<SoldCompSummary> {
  const base =
    process.env.EBAY_FINDING_URL?.trim() ||
    "https://svcs.ebay.com/services/search/FindingService/v1";
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "true",
    keywords: query,
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "paginationInput.entriesPerPage": "25",
    sortOrder: "EndTimeSoonest",
  });

  const res = await fetch(`${base}?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Finding API HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    findCompletedItemsResponse?: Array<{
      ack?: string[];
      searchResult?: Array<{
        "@count"?: string;
        item?: Array<{
          sellingStatus?: Array<{
            currentPrice?: Array<{ __value__?: string }>;
          }>;
        }>;
      }>;
      paginationOutput?: Array<{
        totalEntries?: string[];
      }>;
    }>;
  };

  const resp = data.findCompletedItemsResponse?.[0];
  const ack = resp?.ack?.[0] || "";
  if (ack && !/^Success/i.test(ack)) {
    throw new Error(`Finding API ack=${ack}`);
  }

  const items = resp?.searchResult?.[0]?.item || [];
  const prices: number[] = [];
  for (const item of items) {
    const raw = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0 && n < 100_000) prices.push(n);
  }

  const soldCountRaw = resp?.paginationOutput?.[0]?.totalEntries?.[0];
  const soldCount =
    soldCountRaw != null && Number.isFinite(Number(soldCountRaw))
      ? Number(soldCountRaw)
      : items.length || null;

  const med = median(prices);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;

  // Finding sold-only call does not give active count → no invent sell-through.
  return {
    configured: true,
    query,
    soldCount,
    activeCount: null,
    sellThroughPct: null,
    medianSoldUsd: med != null ? Math.round(med * 100) / 100 : null,
    soldLowUsd: low != null ? Math.round(low * 100) / 100 : null,
    soldHighUsd: high != null ? Math.round(high * 100) / 100 : null,
    note:
      med != null
        ? `Sold comps · est. median $${Math.round(med)} (${prices.length} prices)`
        : soldCount
          ? `Sold listings found (${soldCount}) — no price band`
          : "No sold comps returned",
  };
}

async function browseSoldSearch(
  query: string,
  _appId: string,
  token: string,
  timeoutMs: number
): Promise<SoldCompSummary> {
  // Browse API does not expose sold history the same way; use search as a
  // live-active proxy only. Sell-through stays null unless we also have sold.
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  url.searchParams.set("filter", "conditions:{USED|NEW}");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Browse API HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    total?: number;
    itemSummaries?: Array<{
      price?: { value?: string; currency?: string };
    }>;
  };

  const prices: number[] = [];
  for (const item of data.itemSummaries || []) {
    const n = item.price?.value != null ? Number(item.price.value) : NaN;
    if (Number.isFinite(n) && n > 0 && n < 100_000) prices.push(n);
  }
  const med = median(prices);
  const activeCount =
    typeof data.total === "number" && Number.isFinite(data.total)
      ? data.total
      : (data.itemSummaries?.length ?? null);

  return {
    configured: true,
    query,
    soldCount: null,
    activeCount,
    // Active-only Browse search cannot compute honest sell-through.
    sellThroughPct: null,
    medianSoldUsd: med != null ? Math.round(med * 100) / 100 : null,
    soldLowUsd: prices.length ? Math.round(Math.min(...prices) * 100) / 100 : null,
    soldHighUsd: prices.length ? Math.round(Math.max(...prices) * 100) / 100 : null,
    note:
      med != null
        ? `Active listings · est. median $${Math.round(med)} (not sold comps)`
        : "Browse search returned no prices — sell-through unknown",
  };
}
