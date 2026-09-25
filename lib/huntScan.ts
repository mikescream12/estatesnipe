/**
 * One hunt scan, with a single retry when the first pass fails or
 * comes back empty because a source timed out.
 */

import type { HuntQuery } from "./huntTurn";
import { huntResultMessage, type HuntScanSnapshot } from "./huntReply";

export type HuntListing = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  distanceMiles?: number | null;
  photos?: Array<{ url: string; thumbnailUrl?: string }>;
  startDate?: string | null;
  endDate?: string | null;
};

export type HuntMatch = {
  listing: HuntListing;
  matchedKeywords?: string[];
  matchSource?: "text" | "photo" | "both";
  visionConfidence?: number;
  visionReason?: string;
  isNew?: boolean;
  outsideRadius?: boolean;
  flipMode?: boolean;
  portable?: boolean;
  itemGuess?: string;
  flipNotes?: string;
  flipValueLabel?: string;
  ebayConfigured?: boolean;
  ebayCompsNote?: string;
  sellThroughPct?: number;
  clearsMinAlert?: boolean;
  minAlertValueUsd?: number | null;
};

export type HuntScanPayload = HuntScanSnapshot & {
  matches?: HuntMatch[];
  nearby?: HuntListing[];
};

export type HuntPostResult = {
  status: number;
  data: HuntScanPayload | null;
  errorText?: string;
};

export type HuntScanOutcome = {
  text: string;
  matches: HuntMatch[];
  nearby: HuntListing[];
  radiusMiles: number;
  zip: string;
};

export type HuntScanExtra = {
  flipMode?: boolean;
  minAlertValueUsd?: number | null;
  clientPhone?: string;
  notifyPhone?: string;
  notifyEmail?: string;
};

export function huntScanBody(
  query: HuntQuery,
  deadlineMs: number,
  extra?: HuntScanExtra
): Record<string, unknown> {
  return {
    zip: query.zip,
    radiusMiles: query.radiusMi,
    watchTexts: query.browseAll ? ["*"] : query.keywords,
    onlyNew: false,
    honorRadius: true,
    includeNearby: true,
    excludeAuctions: query.saleMode === "estate",
    saleMode: query.saleMode,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    flipMode: Boolean(extra?.flipMode),
    minAlertValueUsd: extra?.minAlertValueUsd ?? null,
    clientPhone: extra?.clientPhone || undefined,
    notifyPhone: extra?.notifyPhone || undefined,
    notifyEmail: extra?.notifyEmail || undefined,
    // Title scan first. Photo matching can burn the whole 60s platform limit
    // and leave the chat stuck on a spinner.
    skipVision: true,
    deadlineMs,
  };
}

function failed(result: HuntPostResult): boolean {
  if (!result.data) return true;
  if (!result.data.ok) return true;
  if (result.status >= 400) return true;
  const area = result.data.listingCount ?? 0;
  const matches = result.data.matchCount ?? 0;
  if (result.data.partial && area === 0 && matches === 0) return true;
  const sources = result.data.sources || [];
  const allFailed = sources.length > 0 && sources.every((s) => !s.ok);
  if (allFailed && area === 0) return true;
  return false;
}

function reason(result: HuntPostResult, locale: "en" | "es"): string {
  if (result.errorText) return result.errorText;
  if (result.data?.error) return result.data.error;
  if (result.status === 0) {
    return locale === "es" ? "no hubo respuesta" : "no response";
  }
  if (result.status >= 400) {
    return locale === "es"
      ? `el servidor respondió ${result.status}`
      : `the server responded ${result.status}`;
  }
  const bad = (result.data?.sources || []).filter((s) => !s.ok);
  if (bad.length) {
    return bad
      .map((s) => `${s.sourceId}: ${s.reason || "failed"}`)
      .join(". ");
  }
  return locale === "es" ? "el escaneo no trajo ventas" : "the scan returned no sales";
}

export async function executeHuntScan(
  query: HuntQuery,
  post: (body: Record<string, unknown>, timeoutMs: number) => Promise<HuntPostResult>,
  locale: "en" | "es" = "en",
  preface?: string,
  extra?: HuntScanExtra
): Promise<HuntScanOutcome> {
  const first = await post(huntScanBody(query, 35_000, extra), 42_000);
  let used = first;
  let retryNote: string | undefined;
  if (first.errorText === "superseded") {
    return {
      text: "superseded",
      matches: [],
      nearby: [],
      radiusMiles: query.radiusMi,
      zip: query.zip,
    };
  }
  if (failed(first)) {
    const second = await post(huntScanBody(query, 22_000, extra), 28_000);
    const firstWhy = reason(first, locale);
    if (!failed(second)) {
      used = second;
      retryNote =
        locale === "es"
          ? `El primer intento falló (${firstWhy}). Lo reintenté y este es el resultado.`
          : `The first pass failed (${firstWhy}). I retried, and this is the result.`;
    } else {
      used = second.data ? second : first;
      const secondWhy = reason(second, locale);
      retryNote =
        locale === "es"
          ? `Lo intenté dos veces. Primero: ${firstWhy}. Después: ${secondWhy}.`
          : `I tried twice. First: ${firstWhy}. Then: ${secondWhy}.`;
    }
  }

  const data = used.data;
  const snapshot: HuntScanSnapshot = data
    ? { ...data, httpStatus: used.status }
    : {
        ok: false,
        httpStatus: used.status,
        error: used.errorText || reason(used, locale),
      };

  const matches = data?.ok ? data.matches || [] : [];
  const nearby = data?.ok && matches.length === 0 ? data.nearby || [] : [];

  return {
    text: huntResultMessage(query, snapshot, locale, { preface, retryNote }),
    matches,
    nearby,
    radiusMiles: data?.radiusMiles ?? query.radiusMi,
    zip: data?.zip || query.zip,
  };
}
