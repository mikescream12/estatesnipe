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
import { PRO_PRICE_LABEL, resolveScanRadius, type ScanBillingInput } from "./plans";
import { classifyListingDate } from "./saleWindow";
import { getSoldComps, isEbayConfigured } from "./ebayComps";
import {
  clearsMinValue,
  resolveFlipValue,
  type FlipValueEstimate,
} from "./flipValue";
import { emailConfigured, sendMatchEmail } from "./email";

export type ScanRequest = {
  zip: string;
  radiusMiles?: number;
  watchTexts: string[];
  /** If true, only return matches for listings not previously seen */
  onlyNew?: boolean;
  /** Optional E.164 phone for SMS when matches found and TWILIO_* set */
  notifyPhone?: string;
  /** Optional email for match alerts when RESEND_API_KEY is set */
  notifyEmail?: string;
  excludeAuctions?: boolean;
  /** both = no extra filter. estate hides auctions. auction keeps auctions only. */
  saleMode?: "both" | "estate" | "auction";
  /** Set by the request route. Omitted scans use the server paywall default and are not Pro. */
  billing?: ScanBillingInput;
  /**
   * Skip OpenAI vision entirely. Cron defaults this on so Hobby's ~60s
   * ceiling is not burned by photo matching / 429 retries.
   */
  skipVision?: boolean;
  /**
   * Overall wall-clock budget in ms. When remaining time is exhausted,
   * return ok:true with partial:true (text matches kept) instead of a 504.
   * Interactive route uses ~52_000; cron uses ~50_000.
   */
  deadlineMs?: number;
  /** Flip research mode — portable filter + comps hooks */
  flipMode?: boolean;
  /**
   * When set (>0), SMS/email only for matches whose estimated mid value
   * clears this USD bar. Missing estimate does not filter (opt-in gate).
   */
  minAlertValueUsd?: number | null;
  /**
   * Chat searches pass true so "50 miles" is 50 miles. Cron leaves this
   * unset and keeps the free-plan cap.
   */
  honorRadius?: boolean;
  /** When keyword matches are empty, include the closest sales in the radius. */
  includeNearby?: boolean;
  /** ISO timestamps. Undated listings are kept. */
  dateFrom?: string | null;
  dateTo?: string | null;
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
    itemGuess?: string;
    portable?: boolean | null;
    flipNotes?: string;
    flipMode?: boolean;
    flipValueLabel?: string;
    flipValueMidUsd?: number | null;
    flipValueSource?: "ebay" | "vision" | "heuristic" | "none";
    ebayConfigured?: boolean;
    ebayCompsNote?: string;
    sellThroughPct?: number | null;
    clearsMinAlert?: boolean | null;
    minAlertValueUsd?: number | null;
  }>;
  flip?: {
    flipMode: boolean;
    ebayConfigured: boolean;
    minAlertValueUsd: number | null;
  };
  sources: SourceStatus[];
  sms?: { attempted: boolean; sent: boolean; sid?: string; error?: string };
  email?: { attempted: boolean; sent: boolean; error?: string };
  /** Present when vision gating evaluated (enabled or skipped) */
  vision?: VisionScanStats & {
    visionEnabled: boolean;
    premiumVision: boolean;
  };
  error?: string;
  /** True when the scan stopped early (budget / source timeout) with usable data */
  partial?: boolean;
  /** Wall clock for this scan */
  durationMs?: number;
  plan?: {
    tier: "free" | "pro" | "ungated";
    paywallEnforced: boolean;
    radiusCapped: boolean;
    visionGated: boolean;
    proPriceLabel: string;
    honoredPastFreeCap?: boolean;
  };
  /** Closest in-radius sales when nothing matched the keywords. */
  nearby?: SaleListing[];
  /** Listings kept that do not publish a start/end date. */
  undatedCount?: number;
  /** True when a free account asked past 25 miles and this scan used that radius. */
  honoredPastFreeCap?: boolean;
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

const SMS_TIMEOUT_MS = 8_000;

async function maybeSendSms(
  phone: string | undefined,
  hits: MatchHit[],
  remainingMs?: number
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
  const budget =
    remainingMs == null
      ? SMS_TIMEOUT_MS
      : Math.min(SMS_TIMEOUT_MS, Math.max(0, remainingMs));
  if (budget < 500) {
    return {
      attempted: true,
      sent: false,
      error: "Skipped SMS — scan budget exhausted",
    };
  }

  try {
    const client = getTwilioClient();
    const sender = twilioSenderParams();
    // Trial accounts: Body must be a template name. Custom body only post-upgrade.
    const allowCustom = process.env.TWILIO_ALLOW_CUSTOM_BODY === "1";
    const top = hits[0];
    const custom = smsBodyForHit(top);
    const body = allowCustom ? custom : TRIAL_SMS_TEMPLATE;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const message = await Promise.race([
      client.messages.create({ to: phone, ...sender, body }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Twilio timed out after ${budget}ms`)),
          budget
        );
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    return { attempted: true, sent: true, sid: message.sid };
  } catch (err) {
    return {
      attempted: true,
      sent: false,
      error: err instanceof Error ? err.message : "SMS failed",
    };
  }
}

async function maybeSendEmail(
  email: string | undefined,
  hits: MatchHit[],
  remainingMs?: number
): Promise<ScanResponse["email"]> {
  if (!email || hits.length === 0) {
    return { attempted: false, sent: false };
  }
  if (!emailConfigured()) {
    return {
      attempted: false,
      sent: false,
      error: "RESEND_API_KEY not configured",
    };
  }
  if (remainingMs != null && remainingMs < 500) {
    return {
      attempted: true,
      sent: false,
      error: "Skipped email — scan budget exhausted",
    };
  }
  const top = hits[0]!;
  const result = await sendMatchEmail({
    to: email,
    keyword: top.matchedKeywords.join(", ") || top.matchedWatch || "match",
    title: top.listing.title,
    url: top.listing.url,
  });
  return {
    attempted: result.attempted,
    sent: result.sent,
    error: result.error,
  };
}

export async function runScan(req: ScanRequest): Promise<ScanResponse> {
  const zip = (req.zip || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\D/g, "");
  // 0 / NaN / missing → 25. Huge values cap at 100 so Texas is never "in range".
  const requestedRadius = clampRadiusMiles(req.radiusMiles, 25);
  const access = resolveScanRadius(
    requestedRadius,
    req.billing,
    isPaywallEnforced(),
    req.honorRadius === true
  );
  const radiusMiles = access.radiusMiles;
  const plan = {
    tier: access.tier,
    paywallEnforced: access.enforced,
    radiusCapped: access.radiusCapped,
    visionGated: !access.allowVision,
    proPriceLabel: PRO_PRICE_LABEL,
    honoredPastFreeCap: access.honoredPastFreeCap,
  };
  const scannedAt = new Date().toISOString();
  const startedAt = Date.now();
  const deadlineMs =
    typeof req.deadlineMs === "number" && Number.isFinite(req.deadlineMs)
      ? Math.max(5_000, Math.min(55_000, Math.floor(req.deadlineMs)))
      : null;
  const remaining = () =>
    deadlineMs == null ? Number.POSITIVE_INFINITY : deadlineMs - (Date.now() - startedAt);
  let partial = false;

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
      durationMs: Date.now() - startedAt,
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
      durationMs: Date.now() - startedAt,
    };
  }

  const saleMode =
    req.saleMode === "estate" || req.saleMode === "auction" ? req.saleMode : "both";
  const watches: WatchInput[] = watchTexts.map((text) => ({
    text,
    excludeAuctions:
      saleMode === "estate"
        ? true
        : saleMode === "auction"
          ? false
          : req.excludeAuctions,
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
      durationMs: Date.now() - startedAt,
    };
  }

  if (remaining() < 2_000) {
    return {
      ok: true,
      zip,
      radiusMiles,
      scannedAt,
      listingCount: 0,
      matchCount: 0,
      newMatchCount: 0,
      matches: [],
      sources: [],
      partial: true,
      durationMs: Date.now() - startedAt,
      error: "Scan budget exhausted before source fetch",
      plan,
    };
  }

  // Fetch a bit beyond the hard radius so near-misses can appear.
  const fetchRadius = Math.min(100, Math.ceil(softMaxMiles(radiusMiles)));
  // Leave ~8s after sources for geo/match/store/SMS under a deadline.
  const sourceBudget =
    deadlineMs == null
      ? 14_000
      : Math.min(14_000, Math.max(4_000, Math.floor(remaining() - 8_000)));
  const fetched = await fetchAllSources({
    zip,
    radiusMiles: fetchRadius,
    hardRadiusMiles: radiusMiles,
    latitude: origin.latitude,
    longitude: origin.longitude,
    city: origin.city,
    state: origin.state,
    // ESN take:N is not strictly nearest-N; 50 can drop nearby sales (e.g. tools @ ~5 mi).
    limit: 80,
    timeoutMs: sourceBudget,
  });
  const { listings, statuses } = fetched;
  if (fetched.partial) partial = true;

  const geoKeptAll = await filterListingsByWatchGeo(listings, zip, radiusMiles);
  const window =
    req.dateFrom && req.dateTo ? { from: req.dateFrom, to: req.dateTo } : null;
  let undatedCount = 0;
  const geoKept = geoKeptAll.filter((g) => {
    if (saleMode === "estate" && g.listing.isAuction) return false;
    if (saleMode === "auction" && !g.listing.isAuction) return false;
    const dated = classifyListingDate(g.listing, window);
    if (dated === "out") return false;
    if (dated === "undated" && window) undatedCount += 1;
    return true;
  });
  const outsideRadiusById = new Map(
    geoKept.map((g) => [g.listing.id, g.outsideRadius])
  );
  const geoListings = geoKept.map((g) => g.listing);

  const textHits = matchListings(geoListings, watches, { outsideRadiusById });
  const textHitIds = new Set(textHits.map((h) => h.listing.id));

  const visionCfg = getVisionConfig();
  // Cron may skip vision entirely. Interactive keeps vision but never past
  // the wall-clock deadline — degrade to text-only rather than 504.
  const skipVision =
    req.skipVision === true ||
    remaining() < 8_000 ||
    !access.allowVision;

  let visionPass: { hits: MatchHit[]; stats: VisionScanStats } = {
    hits: [] as MatchHit[],
    stats: {
      attempted: false,
      enabled: false,
      hasApiKey: false,
      candidates: 0,
      evaluated: 0,
      matched: 0,
      skippedReason: req.skipVision
        ? "cron_skip_vision"
        : remaining() < 8_000
          ? "budget_skip_vision"
          : "vision_gated",
    },
  };

  if (!skipVision) {
    // Leave ~3s after vision for store + SMS + JSON serialize under Hobby 60s.
    const visionDeadlineAt =
      deadlineMs == null
        ? undefined
        : startedAt + deadlineMs - 3_000;
    const visionBudgetMs =
      visionDeadlineAt == null
        ? undefined
        : Math.max(0, visionDeadlineAt - Date.now());

    try {
      if (visionBudgetMs != null && visionBudgetMs < 4_000) {
        visionPass = {
          hits: [],
          stats: {
            attempted: true,
            enabled: visionCfg.visionEnabled,
            hasApiKey: true,
            candidates: 0,
            evaluated: 0,
            matched: 0,
            skippedReason: "vision_budget",
          },
        };
        partial = true;
      } else {
        visionPass = await runVisionPass({
          listings: geoListings,
          watches,
          textHitIds,
          outsideRadiusById,
          deadlineAt: visionDeadlineAt,
        });
        if (visionPass.stats.skippedReason === "vision_budget") {
          partial = true;
        }
      }
    } catch {
      // Never fail the whole scan on vision errors — text matches still return.
      visionPass = {
        hits: [],
        stats: {
          attempted: true,
          enabled: visionCfg.visionEnabled,
          hasApiKey: true,
          candidates: 0,
          evaluated: 0,
          matched: 0,
          skippedReason: "vision_error",
        },
      };
      partial = true;
    }
  }

  const allHits = mergeTextAndPhotoHits(textHits, visionPass.hits);
  const flipMode = Boolean(req.flipMode);
  const minAlertRaw = req.minAlertValueUsd;
  const minAlertValueUsd =
    typeof minAlertRaw === "number" &&
    Number.isFinite(minAlertRaw) &&
    minAlertRaw > 0
      ? Math.round(minAlertRaw)
      : null;
  const ebayOn = isEbayConfigured();

  // Attach flip value estimates (eBay when configured; else vision/heuristic).
  // Cap eBay calls to top 5 to stay under Hobby deadline.
  const enrichTargets = allHits.slice(0, flipMode || ebayOn ? 5 : 0);
  const compsByListing = new Map<string, Awaited<ReturnType<typeof getSoldComps>>>();
  if (ebayOn && enrichTargets.length && remaining() > 6_000) {
    await Promise.all(
      enrichTargets.map(async (h) => {
        const q =
          h.itemGuess ||
          h.matchedKeywords[0] ||
          h.matchedWatch ||
          h.listing.title.slice(0, 80);
        try {
          const comps = await getSoldComps(q, {
            timeoutMs: Math.min(6_000, Math.max(2_000, remaining() - 2_000)),
          });
          compsByListing.set(h.listing.id, comps);
        } catch {
          /* leave unconfigured note later */
        }
      })
    );
  }

  const valueById = new Map<string, FlipValueEstimate>();
  for (const h of allHits) {
    const comps = compsByListing.get(h.listing.id);
    const est = resolveFlipValue({
      comps,
      valueEstLowUsd: h.valueEstLowUsd,
      valueEstHighUsd: h.valueEstHighUsd,
      fallbackText:
        flipMode || minAlertValueUsd != null
          ? [h.itemGuess, h.matchedWatch, h.matchedKeywords.join(" ")]
              .filter(Boolean)
              .join(" ")
          : undefined,
    });
    valueById.set(h.listing.id, est);
    h.flipValueLabel = est.label || undefined;
    h.flipValueMidUsd = est.midUsd;
    h.flipValueSource = est.source;
    h.ebayConfigured = ebayOn;
    if (comps) {
      h.ebayCompsNote = comps.note;
      h.sellThroughPct =
        comps.sellThroughPct == null ? null : comps.sellThroughPct;
    } else if (flipMode || ebayOn) {
      h.ebayCompsNote = ebayOn
        ? undefined
        : "Comps: connect eBay to score sell-through";
      h.sellThroughPct = null;
    }
  }

  const hitIds = allHits.map((h) => h.listing.id);
  const newIds = await filterNewIds(hitIds);
  const newIdSet = new Set(newIds);

  const matches = allHits.map((h) => {
    const est = valueById.get(h.listing.id);
    const clears = clearsMinValue(est, minAlertValueUsd);
    return {
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
      itemGuess: h.itemGuess,
      portable: h.portable,
      flipNotes: h.flipNotes,
      flipMode,
      flipValueLabel: h.flipValueLabel,
      flipValueMidUsd: h.flipValueMidUsd ?? null,
      flipValueSource: h.flipValueSource,
      ebayConfigured: h.ebayConfigured ?? ebayOn,
      ebayCompsNote: h.ebayCompsNote,
      sellThroughPct: h.sellThroughPct ?? null,
      clearsMinAlert: clears,
      minAlertValueUsd,
    };
  });

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
  // When minAlertValueUsd is set, skip hits whose estimate is below the bar.
  // Missing estimate does not filter (opt-in gate stays honest).
  const smsHits = newHits.filter((h) => {
    if (h.outsideRadius) return false;
    if (
      typeof h.listing.distanceMiles !== "number" ||
      !Number.isFinite(h.listing.distanceMiles) ||
      h.listing.distanceMiles > radiusMiles
    ) {
      return false;
    }
    if (minAlertValueUsd == null) return true;
    const clears = clearsMinValue(valueById.get(h.listing.id), minAlertValueUsd);
    if (clears === false) return false;
    return true;
  });

  const alertHits = smsHits;

  const sms = await maybeSendSms(
    req.notifyPhone,
    alertHits.length ? alertHits : [],
    remaining()
  );

  const email = await maybeSendEmail(
    req.notifyEmail,
    alertHits.length ? alertHits : [],
    remaining()
  );

  void recorded;

  const reported = req.onlyNew === false ? matches : toReport;
  const nearby =
    req.includeNearby && reported.length === 0
      ? [...geoListings]
          .sort((a, b) => {
            const da =
              typeof a.distanceMiles === "number" ? a.distanceMiles : 9999;
            const db =
              typeof b.distanceMiles === "number" ? b.distanceMiles : 9999;
            return da - db;
          })
          .slice(0, 8)
          .map((listing) => ({ ...listing, description: "" }))
      : undefined;

  return {
    ok: true,
    zip,
    radiusMiles,
    scannedAt,
    listingCount: geoListings.length,
    matchCount: allHits.length,
    newMatchCount: newHits.length,
    matches: reported,
    nearby,
    undatedCount: window ? undatedCount : undefined,
    honoredPastFreeCap: access.honoredPastFreeCap,
    sources: statuses,
    sms,
    email,
    vision: {
      ...visionPass.stats,
      visionEnabled:
        access.allowVision && visionCfg.visionEnabled && !req.skipVision,
      premiumVision:
        access.allowVision && visionCfg.premiumVision && !req.skipVision,
    },
    flip: {
      flipMode,
      ebayConfigured: ebayOn,
      minAlertValueUsd,
    },
    plan,
    ...(partial ? { partial: true } : {}),
    durationMs: Date.now() - startedAt,
  };
}
