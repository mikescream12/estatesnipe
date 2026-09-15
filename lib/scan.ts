/**
 * One scan cycle: fetch sources → match watches → record new hits → optional SMS.
 */

import { matchListings, type MatchHit, type WatchInput } from "./match";
import { fetchAllSources } from "./sources";
import type { SaleListing, SourceStatus } from "./sources/types";
import {
  filterNewIds,
  markSeen,
  recordMatches,
  touchScan,
  type StoredMatch,
} from "./store";
import {
  getTwilioClient,
  getTwilioFromNumber,
  isE164,
  TRIAL_SMS_TEMPLATE,
} from "./twilio";

export type ScanRequest = {
  zip: string;
  radiusMiles?: number;
  watchTexts: string[];
  /** If true, only return matches for listings not previously seen */
  onlyNew?: boolean;
  /** Optional E.164 phone for SMS when matches found and TWILIO_* set */
  notifyPhone?: string;
  excludeAuctions?: boolean;
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
    fields: Array<"title" | "description">;
    isNew: boolean;
  }>;
  sources: SourceStatus[];
  sms?: { attempted: boolean; sent: boolean; sid?: string; error?: string };
  error?: string;
};

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
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
    const from = getTwilioFromNumber();
    // Trial accounts: Body must be a template name. Custom body only post-upgrade.
    const allowCustom = process.env.TWILIO_ALLOW_CUSTOM_BODY === "1";
    const top = hits[0];
    const custom = `EstateSnipe: “${top.matchedKeywords.join(", ")}” may match — ${top.listing.title.slice(0, 80)}. ${top.listing.url}`;
    const body = allowCustom ? custom : TRIAL_SMS_TEMPLATE;
    const message = await client.messages.create({ to: phone, from, body });
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
  const radiusMiles = Math.max(1, Math.min(req.radiusMiles ?? 25, 100));
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

  const { listings, statuses } = await fetchAllSources({
    zip,
    radiusMiles,
    limit: 50,
  });

  const allHits = matchListings(listings, watches);
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

  const sms = await maybeSendSms(
    req.notifyPhone,
    // SMS only for brand-new matches
    newHits.length ? newHits : []
  );

  void recorded;

  return {
    ok: true,
    zip,
    radiusMiles,
    scannedAt,
    listingCount: listings.length,
    matchCount: allHits.length,
    newMatchCount: newHits.length,
    matches: req.onlyNew === false ? matches : toReport,
    sources: statuses,
    sms,
  };
}
