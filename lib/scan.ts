/**
 * One scan cycle: fetch sources → geo-filter → match watches → record new hits → optional SMS.
 */

import { matchListings, type MatchHit, type WatchInput } from "./match";
import { fetchAllSources } from "./sources";
import type { SaleListing, SourceStatus } from "./sources/types";
import { filterListingsByWatchGeo } from "./geoFilter";
import { clampRadiusMiles, resolveZip, softMaxMiles } from "./sources/geo";
import {
  filterNewIds,
  markSeen,
  recordMatches,
  touchScan,
  type StoredMatch,
} from "./store";
import {
  getTwilioClient,
  getTwilioMessagingServiceSid,
  isE164,
  TRIAL_SMS_TEMPLATE,
  twilioSenderParams,
} from "./twilio";
import {
  mergeTextAndPhotoHits,
  runVisionPass,
  type VisionScanStats,
} from "./vision/scanVision";
import { getVisionConfig } from "./vision/config";
import { isPaywallEnforced } from "./billing";
import { gateScanAccess, PRO_PRICE_LABEL, type ScanBillingInput } from "./plans";

export type ScanRequest = {
  zip: string;
  radiusMiles?: number;
  watchTexts: string[];
  /** If true, only return matches for listings not previously seen */
  onlyNew?: boolean;
  /** Optional E.164 phone for SMS when matches found and TWILIO_* set */
  notifyPhone?: string;
  excludeAuctions?: boolean;
  /** Set by the request route. Omitted scans use the server paywall default and are not Pro. */
  billing?: ScanBillingInput;
};

export type ScanResponse = {
  ok: boolean;
  zip: string;
  radiusMiles: number;
  scannedAt: string;
  listingCount: number;
  matchCount: number;
  newMatchCount: number;
  matches: Array<{
    listing: SaleListing;
    matchedWatch: string;
    matchedKeywords: string[];
    score: number;
    fields: Array<"title" | "description" | "category">;
    isNew: boolean;
    outsideRadius?: boolean;
    matchSource?: "text" | "photo" | "both";
    visionConfidence?: number;
    visionReason?: string;
    visionLabels?: string[];
  }>;
  sources: SourceStatus[];
  sms?: { attempted: boolean; sent: boolean; sid?: string; error?: string };
  /** Present when vision gating evaluated (enabled or skipped) */
  vision?: VisionScanStats & {
    visionEnabled: boolean;
    premiumVision: boolean;
  };
  error?: string;
  plan?: {
    tier: "free" | "pro" | "ungated";
    paywallEnforced: boolean;
    radiusCapped: boolean;
    visionGated: boolean;
    proPriceLabel: string;
  };
};

function twilioConfigured(): boolean {
  const hasCreds = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
  if (!hasCreds) return false;
  if (getTwilioMessagingServiceSid()) return true;
  const from = (process.env.TWILIO_PHONE_NUMBER || "").trim();
  return Boolean(from && isE164(from) && !from.includes("[SENSITIVE]"));
}

function smsBodyForHit(hit: MatchHit): string {
  const kw = hit.matchedKeywords.join(", ");
  const title = hit.listing.title.slice(0, 80);
  const url = hit.listing.url;
  const via =
    hit.matchSource === "photo"
      ? " (photos)"
      : hit.matchSource === "both"
        ? " (text+photos)"
        : "";
  if (hit.outsideRadius) {
    const dist =
      hit.listing.distanceMiles != null
        ? ` · ${hit.listing.distanceMiles} mi`
        : "";
    return `EstateSnipe OUTSIDE RADIUS: “${kw}” may match${via} — ${title}${dist}. ${url}`;
  }
  return `EstateSnipe: “${kw}” may match${via} — ${title}. ${url}`;
}

async function maybeSendSms(
  phone: string | undefined,
  hits: MatchHit[]
): Promise<ScanResponse["sms"]> {
  if (!phone || hits.length === 0) {
    return { attempted: false, sent: false };
  }
  if (!twilioConfigured()) {
    return {
      attempted: false,
      sent: false,
      error: "TWILIO_* not configured",
    };
  }
  if (!isE164(phone)) {
    return { attempted: true, sent: false, error: "notifyPhone must be E.164" };
  }

  try {
    const client = getTwilioClient();
    const sender = twilioSenderParams();
    // Trial accounts: Body must be a template name. Custom body only post-upgrade.
    const allowCustom = process.env.TWILIO_ALLOW_CUSTOM_BODY === "1";
    const top = hits[0];
    const custom = smsBodyForHit(top);
    const body = allowCustom ? custom : TRIAL_SMS_TEMPLATE;
    const message = await client.messages.create({ to: phone, ...sender, body });
    return { attempted: true, sent: true, sid: message.sid };
  } catch (err) {
    return {
      attempted: true,
      sent: false,
      error: err instanceof Error ? err.message : "SMS failed",
    };
  }
}

export async function runScan(req: ScanRequest): Promise<ScanResponse> {
  const zip = (req.zip || "").trim();
  // 0 / NaN / missing → 25. Huge values cap at 100 so Texas is never "in range".
  const requestedRadius = clampRadiusMiles(req.radiusMiles, 25);
  const access = gateScanAccess(requestedRadius, req.billing, isPaywallEnforced());
  const radiusMiles = access.radiusMiles;
  const plan = {
    tier: access.tier,
    paywallEnforced: access.enforced,
    radiusCapped: access.radiusCapped,
    visionGated: !access.allowVision,
    proPriceLabel: PRO_PRICE_LABEL,
  };
  const scannedAt = new Date().toISOString();

  if (!/^\d{5}$/.test(zip)) {
    return {
      ok: false,
      zip,
      radiusMiles,
      scannedAt,
      listingCount: 0,
      matchCount: 0,
      newMatchCount: 0,
      matches: [],
      sources: [],
      error: "zip must be a 5-digit US postal code",
    };
  }

  const watchTexts = (req.watchTexts || [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (watchTexts.length === 0) {
    return {
      ok: false,
      zip,
      radiusMiles,
      scannedAt,
      listingCount: 0,
      matchCount: 0,
      newMatchCount: 0,
      matches: [],
      sources: [],
      error: "watchTexts must be a non-empty string array",
    };
  }

  const watches: WatchInput[] = watchTexts.map((text) => ({
    text,
    excludeAuctions: req.excludeAuctions,
  }));

  const origin = await resolveZip(zip, { crossCheck: true });
  if (!origin) {
    return {
      ok: false,
      zip,
      radiusMiles,
      scannedAt,
      listingCount: 0,
      matchCount: 0,
      newMatchCount: 0,
      matches: [],
      sources: [],
      error: `Could not verify location for zip ${zip}. No sales returned.`,
    };
  }

  // Fetch a bit beyond the hard radius so near-misses can appear.
  const fetchRadius = Math.min(100, Math.ceil(softMaxMiles(radiusMiles)));
  const { listings, statuses } = await fetchAllSources({
    zip,
    radiusMiles: fetchRadius,
    hardRadiusMiles: radiusMiles,
    latitude: origin.latitude,
    longitude: origin.longitude,
    city: origin.city,
    state: origin.state,
    // ESN take:N is not strictly nearest-N; 50 can drop nearby sales (e.g. tools @ ~5 mi).
    limit: 80,
  });

  const geoKept = await filterListingsByWatchGeo(listings, zip, radiusMiles);
  const geoListings = geoKept.map((g) => g.listing);
  const outsideRadiusById = new Map(
    geoKept.map((g) => [g.listing.id, g.outsideRadius])
  );

  const textHits = matchListings(geoListings, watches, { outsideRadiusById });
  const textHitIds = new Set(textHits.map((h) => h.listing.id));

  const visionCfg = getVisionConfig();
  const visionPass = access.allowVision
    ? await runVisionPass({
        listings: geoListings,
        watches,
        textHitIds,
        outsideRadiusById,
      })
    : {
        hits: [] as MatchHit[],
        stats: {
          attempted: false,
          enabled: false,
          hasApiKey: false,
          candidates: 0,
          evaluated: 0,
          matched: 0,
        },
      };

  const allHits = mergeTextAndPhotoHits(textHits, visionPass.hits);
  const hitIds = allHits.map((h) => h.listing.id);
  const newIds = await filterNewIds(hitIds);
  const newIdSet = new Set(newIds);

  const matches = allHits.map((h) => ({
    listing: h.listing,
    matchedWatch: h.matchedWatch,
    matchedKeywords: h.matchedKeywords,
    score: h.score,
    fields: h.fields,
    isNew: newIdSet.has(h.listing.id),
    outsideRadius: Boolean(h.outsideRadius),
    matchSource: h.matchSource || "text",
    visionConfidence: h.visionConfidence,
    visionReason: h.visionReason,
    visionLabels: h.visionLabels,
  }));

  const toReport =
    req.onlyNew === false ? matches : matches.filter((m) => m.isNew);

  // Persist: mark all scanned listing ids seen; record new matches
  await markSeen(listings.map((l) => l.id));
  const newHits = allHits.filter((h) => newIdSet.has(h.listing.id));
  let recorded: StoredMatch[] = [];
  if (newHits.length) {
    recorded = await recordMatches(newHits);
  } else {
    await touchScan();
  }

  // SMS: hard in-radius only. Near-miss stays in the UI. Unknown distance never texts.
  const smsHits = newHits.filter(
    (h) =>
      !h.outsideRadius &&
      typeof h.listing.distanceMiles === "number" &&
      Number.isFinite(h.listing.distanceMiles) &&
      h.listing.distanceMiles <= radiusMiles
  );

  const sms = await maybeSendSms(
    req.notifyPhone,
    smsHits.length ? smsHits : []
  );

  void recorded;

  return {
    ok: true,
    zip,
    radiusMiles,
    scannedAt,
    listingCount: geoListings.length,
    matchCount: allHits.length,
    newMatchCount: newHits.length,
    matches: req.onlyNew === false ? matches : toReport,
    sources: statuses,
    sms,
    vision: {
      ...visionPass.stats,
      visionEnabled: access.allowVision && visionCfg.visionEnabled,
      premiumVision: access.allowVision && visionCfg.premiumVision,
    },
    plan,
  };
}
