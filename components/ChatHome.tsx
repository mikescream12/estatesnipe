"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import {
  MAX_MAPS_STOPS,
  buildMultiStopMapsUrl,
  sortStopsForRoute,
} from "@/lib/routePlan";
import { CheckoutButton } from "@/components/CheckoutButton";
import { EXAMPLE_PROMPTS } from "@/lib/chatPersonality";
import { isFounderPhone } from "@/lib/founder";
import { clampRadiusMiles, preferredZip } from "@/lib/geoPure";
import { describeHunt, applyHuntTurn, emptyHuntQuery, type HuntQuery } from "@/lib/huntTurn";
import { executeHuntScan, type HuntPostResult } from "@/lib/huntScan";
import { useLocale } from "@/lib/LocaleContext";
import { parseWatchIntent } from "@/lib/parseWatchIntent";
import { normalizePhone } from "@/lib/phone";
import { FREE_RADIUS_MI, PRO_MAX_RADIUS_MI } from "@/lib/plans";
import {
  addWatches,
  deleteWatch,
  loadProfile,
  loadWatches,
  saveProfile,
  saveWatches,
  type Watch,
} from "@/lib/watches";
import { pushLocalState } from "@/lib/watchSync";

type ScanMatch = {
  listing: {
    id: string;
    title: string;
    url: string;
    sourceId: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    distanceMiles?: number | null;
    photos?: Array<{ url: string; thumbnailUrl?: string }>;
  };
  matchedWatch: string;
  matchedKeywords: string[];
  score: number;
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
  ebayConfigured?: boolean;
  ebayCompsNote?: string;
  sellThroughPct?: number | null;
  clearsMinAlert?: boolean | null;
  minAlertValueUsd?: number | null;
};

type ScanResult = {
  ok: boolean;
  error?: string;
  listingCount?: number;
  matchCount?: number;
  newMatchCount?: number;
  radiusMiles?: number;
  matches?: ScanMatch[];
  sources?: Array<{
    sourceId: string;
    ok: boolean;
    listingCount: number;
    reason?: string;
  }>;
  vision?: {
    enabled?: boolean;
    visionEnabled?: boolean;
    matched?: number;
    evaluated?: number;
    skippedReason?: string;
  };
  plan?: {
    tier?: "free" | "pro" | "ungated";
    paywallEnforced?: boolean;
    radiusCapped?: boolean;
  };
};

type Msg =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      matches?: ScanMatch[];
      radiusMiles?: number;
      scanning?: boolean;
    };

function uid() {
  return crypto.randomUUID();
}

function focusComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.focus();
  try {
    const len = el.value.length;
    el.setSelectionRange(len, len);
  } catch {
    /* older WebKit */
  }
}

export function ChatHome() {
  const { locale, messages } = useLocale();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [saleMode, setSaleMode] = useState<"both" | "estate" | "auction">(
    "both"
  );
  const [founderPro, setFounderPro] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [profileZip, setProfileZip] = useState("");
  const [profileRadius, setProfileRadius] = useState(25);
  const [keepTexting, setKeepTexting] = useState(false);
  const [minAlertValueUsd, setMinAlertValueUsd] = useState<number | null>(null);
  const [flipModeActive, setFlipModeActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryRef = useRef<HuntQuery>(emptyHuntQuery());
  const scanGen = useRef(0);

  useEffect(() => {
    const profile = loadProfile();
    if (profile?.zip) setProfileZip(profile.zip);
    if (profile?.radiusMi) setProfileRadius(profile.radiusMi);
    queryRef.current = emptyHuntQuery({
      zip: profile?.zip || "",
      radiusMi: profile?.radiusMi || 25,
    });
    setFounderPro(isFounderPhone(profile?.phone));
    setKeepTexting(Boolean(profile?.consentAlerts && profile?.phone));
    setMinAlertValueUsd(
      typeof profile?.minAlertValueUsd === "number" &&
        Number.isFinite(profile.minAlertValueUsd) &&
        profile.minAlertValueUsd > 0
        ? Math.round(profile.minAlertValueUsd)
        : null
    );
    setWatches(loadWatches());
    const saved = window.localStorage.getItem("estatesnipe.saleMode");
    if (saved === "estate" || saved === "auction" || saved === "both") {
      setSaleMode(saved);
      queryRef.current = { ...queryRef.current, saleMode: saved };
    }
    void pushLocalState();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, alertsOpen]);

  function chooseSaleMode(mode: "both" | "estate" | "auction") {
    setSaleMode(mode);
    queryRef.current = { ...queryRef.current, saleMode: mode };
    window.localStorage.setItem("estatesnipe.saleMode", mode);
    void pushLocalState();
  }

  async function runHunt(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;

    const gen = ++scanGen.current;
    setInput("");
    setBusy(true);

    const userMsg: Msg = { id: uid(), role: "user", text };
    const scanningId = uid();
    setMsgs((m) => [
      ...m,
      userMsg,
      {
        id: scanningId,
        role: "assistant",
        text: locale === "es" ? "Buscando…" : "Searching…",
        scanning: true,
      },
    ]);

    const profile = loadProfile();
    const profilePhone =
      normalizePhone(profile?.phone) || profile?.phone || "";
    const unlocked = isFounderPhone(profilePhone);
    setFounderPro(unlocked);

    const parsed = parseWatchIntent(text, locale);
    let huntFlip = flipModeActive;
    if (parsed.flipMode) huntFlip = true;
    setFlipModeActive(huntFlip);
    let activeMinAlert = minAlertValueUsd;
    if (parsed.minAlertValueUsd != null) {
      activeMinAlert = parsed.minAlertValueUsd;
      setMinAlertValueUsd(parsed.minAlertValueUsd);
    }

    const seeded: HuntQuery = {
      ...queryRef.current,
      zip: queryRef.current.zip || profileZip,
      radiusMi: queryRef.current.radiusMi || profileRadius || 25,
      saleMode,
    };
    const turn = applyHuntTurn(seeded, text, locale);
    queryRef.current = turn.query;

    const finish = (patch: Partial<Extract<Msg, { role: "assistant" }>>) => {
      if (scanGen.current !== gen) return;
      setMsgs((m) =>
        m.map((msg) =>
          msg.id === scanningId && msg.role === "assistant"
            ? { ...msg, scanning: false, ...patch }
            : msg
        )
      );
    };

    if (turn.action === "ask") {
      if (parsed.minAlertValueUsd != null) {
        const prev = loadProfile();
        saveProfile({
          phone: prev?.phone || "",
          email: prev?.email || "",
          zip: prev?.zip || profileZip || "",
          radiusMi: prev?.radiusMi || profileRadius || 25,
          consentAlerts: Boolean(prev?.consentAlerts),
          consentMarketing: Boolean(prev?.consentMarketing),
          minAlertValueUsd: parsed.minAlertValueUsd,
        });
        void pushLocalState();
      }
      finish({ text: turn.ask || parsed.reply });
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    const q = turn.query;
    setProfileZip(q.zip);
    setProfileRadius(q.radiusMi);
    setSaleMode(q.saleMode);
    setMsgs((m) =>
      m.map((msg) =>
        msg.id === scanningId && msg.role === "assistant"
          ? {
              ...msg,
              text:
                locale === "es"
                  ? `Buscando ${describeHunt(q, locale)}…`
                  : `Searching ${describeHunt(q, locale)}…`,
            }
          : msg
      )
    );

    const keyword = q.browseAll ? "anything" : q.keywords.join(", ");
    addWatches([
      {
        keyword,
        zip: q.zip,
        radiusMi: q.radiusMi,
        excludeAuctions: q.saleMode === "estate" || undefined,
        notes: parsed.notes.length ? parsed.notes : undefined,
      },
    ]);
    setWatches(loadWatches());

    if (profile) {
      saveProfile({
        ...profile,
        zip: q.zip,
        radiusMi: q.radiusMi,
        minAlertValueUsd: activeMinAlert,
      });
    } else {
      saveProfile({
        phone: "",
        email: "",
        zip: q.zip,
        radiusMi: q.radiusMi,
        consentAlerts: false,
        consentMarketing: false,
        minAlertValueUsd: activeMinAlert,
      });
    }
    void pushLocalState();

    try {
      const outcome = await executeHuntScan(
        q,
        async (body, timeoutMs): Promise<HuntPostResult> => {
          if (scanGen.current !== gen) {
            return { status: 0, data: null, errorText: "superseded" };
          }
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs);
          try {
            const res = await fetch("/api/watch/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ctrl.signal,
              body: JSON.stringify(body),
            });
            const data = (await res.json()) as ScanResult & {
              nearby?: ScanMatch["listing"][];
              honoredPastFreeCap?: boolean;
              undatedCount?: number;
              partial?: boolean;
              httpStatus?: number;
            };
            return {
              status: res.status,
              data: { ...data, httpStatus: res.status },
            } as HuntPostResult;
          } catch (err) {
            if (scanGen.current !== gen) {
              return { status: 0, data: null, errorText: "superseded" };
            }
            const message =
              err instanceof Error ? err.message : "the request failed";
            return { status: 0, data: null, errorText: message };
          } finally {
            clearTimeout(timer);
          }
        },
        locale,
        turn.preface,
        {
          flipMode: huntFlip,
          minAlertValueUsd: activeMinAlert,
          clientPhone: profilePhone || undefined,
          notifyPhone: profile?.consentAlerts
            ? profilePhone || undefined
            : undefined,
          notifyEmail:
            profile?.consentAlerts && profile?.email
              ? profile.email
              : undefined,
        }
      );

      if (scanGen.current !== gen || outcome.text === "superseded") return;

      const keywordHits = outcome.matches as ScanMatch[];
      const nearbyCards: ScanMatch[] = outcome.nearby.map((listing) => ({
        listing,
        matchedWatch: "",
        matchedKeywords: [],
        score: 0,
        isNew: false,
      }));
      const cards = (keywordHits.length ? keywordHits : nearbyCards).slice(0, 8);
      finish({
        text: outcome.text,
        matches: cards,
        radiusMiles: outcome.radiusMiles,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "the request failed";
      finish({
        text:
          locale === "es"
            ? `No pude terminar el escaneo. ${message}`
            : `I couldn’t finish the scan. ${message}`,
      });
    } finally {
      if (scanGen.current === gen) {
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    void runHunt(input);
  }

  function onExample(prompt: string) {
    // Fill the composer so the user can edit before sending.
    setInput(prompt);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = prompt.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* older WebKit */
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void runHunt(input);
    }
  }

  function onDeleteWatch(id: string) {
    setWatches(deleteWatch(id));
    void pushLocalState();
  }

  function saveKeepTexting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") || "");
    const email = String(fd.get("email") || "");
    const zip = preferredZip(String(fd.get("zip") || profileZip), null);
    const radiusMi = Math.min(
      clampRadiusMiles(String(fd.get("radius") || profileRadius), 25),
      isFounderPhone(phone) ? PRO_MAX_RADIUS_MI : FREE_RADIUS_MI
    );
    const consent = fd.get("consent") === "on";
    const minRaw = String(fd.get("minAlertValue") || "").trim();
    let nextMin: number | null = null;
    if (minRaw && minRaw !== "none") {
      const n = Number(minRaw);
      if (Number.isFinite(n) && n > 0) nextMin = Math.round(n);
    }
    setMinAlertValueUsd(nextMin);
    saveProfile({
      phone,
      email,
      zip: zip || profileZip,
      radiusMi,
      consentAlerts: consent,
      consentMarketing: false,
      minAlertValueUsd: nextMin,
    });
    if (zip) setProfileZip(zip);
    setProfileRadius(radiusMi);
    setKeepTexting(Boolean(consent && phone));
    setFounderPro(isFounderPhone(phone));
    // Ensure current watches sync with updated zip/radius
    const list = loadWatches().map((w) => ({
      ...w,
      zip: zip || w.zip,
      radiusMi,
    }));
    saveWatches(list);
    setWatches(list);
    void pushLocalState();
  }

  const empty = msgs.length === 0;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-0.02em] text-ss-text">
            {messages.chatHomeTitle}
          </h1>
          <p className="text-xs text-ss-muted">{messages.chatHomeSub}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ss-brand-50 px-2.5 py-1 text-[0.72rem] font-bold text-ss-accent ring-1 ring-ss-brand-100">
            {founderPro ? "Pro" : messages.proBadge}
          </span>
          <button
            type="button"
            onClick={() => setAlertsOpen((o) => !o)}
            className="rounded-2xl border border-ss-line bg-ss-card px-2.5 py-2 text-[0.72rem] font-semibold text-ss-muted shadow-sm"
          >
            {messages.alertsLink}
            {watches.length ? ` (${watches.length})` : ""}
          </button>
        </div>
      </div>

      {(flipModeActive || minAlertValueUsd != null) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {flipModeActive ? (
            <span className="rounded-full border border-ss-brand-100 bg-ss-brand-50 px-2.5 py-1 text-[0.7rem] font-bold text-ss-accent">
              Flip mode · portable
            </span>
          ) : null}
          {minAlertValueUsd != null ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.7rem] font-bold text-amber-800">
              Alert ≥ ${minAlertValueUsd}
            </span>
          ) : null}
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-full bg-[#efebe3] p-1" role="group" aria-label="Sale type">
        {(
          [
            ["both", "Both"],
            ["estate", "Estate sales"],
            ["auction", "Auctions"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => chooseSaleMode(mode)}
            className={
              saleMode === mode
                ? "rounded-full bg-ss-accent px-2 py-2 text-center text-[0.72rem] font-bold text-white shadow-sm"
                : "rounded-full bg-[#efebe3] px-2 py-2 text-center text-[0.72rem] font-semibold text-ss-text"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {alertsOpen ? (
        <div className="mb-3 rounded-[18px] border border-ss-line bg-ss-card p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">{messages.alertsSheetTitle}</h2>
            <button
              type="button"
              className="text-xs text-ss-muted"
              onClick={() => setAlertsOpen(false)}
            >
              Close
            </button>
          </div>
          <p className="mb-3 text-xs text-ss-muted">{messages.alertsSheetBlurb}</p>

          {watches.length === 0 ? (
            <p className="mb-3 text-sm text-ss-muted">{messages.alertsEmpty}</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {watches.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-ss-line bg-ss-bg px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold text-ss-accent">
                      {w.keyword}
                    </div>
                    <div className="text-[0.7rem] text-ss-muted">
                      {w.zip} · {w.radiusMi} mi
                      {w.excludeAuctions ? " · skip auctions" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteWatch(w.id)}
                    className="text-xs font-semibold text-ss-danger"
                  >
                    {messages.deleteWatch}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={saveKeepTexting} className="space-y-2">
            <p className="text-[0.78rem] font-bold uppercase tracking-wide text-ss-accent2">
              {messages.keepTextingTitle}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="zip"
                defaultValue={profileZip}
                placeholder="Zip"
                aria-label="Zip"
              />
              <input
                name="radius"
                type="number"
                min={1}
                max={founderPro ? PRO_MAX_RADIUS_MI : FREE_RADIUS_MI}
                defaultValue={profileRadius}
                placeholder="mi"
                aria-label="Radius"
              />
            </div>
            <label className="block text-[0.72rem] font-semibold text-ss-muted">
              Min alert value (USD)
              <select
                name="minAlertValue"
                defaultValue={
                  minAlertValueUsd != null ? String(minAlertValueUsd) : "none"
                }
                className="mt-1 w-full rounded-xl border border-ss-line bg-ss-input px-3 py-2 text-sm text-ss-text"
                aria-label="Minimum alert value"
              >
                <option value="none">No minimum (alert all)</option>
                <option value="25">$25+</option>
                <option value="50">$50+</option>
                <option value="80">$80+</option>
                <option value="100">$100+</option>
                <option value="200">$200+</option>
              </select>
            </label>
            <p className="text-[0.68rem] text-ss-muted">
              Opt-in: only text/email when estimated flip value clears this bar.
              Or say “only text me if worth $80+” in chat.
            </p>
            <input
              name="phone"
              type="tel"
              defaultValue={loadProfile()?.phone || ""}
              placeholder={messages.phoneLabel}
              aria-label={messages.phoneLabel}
            />
            <input
              name="email"
              type="email"
              defaultValue={loadProfile()?.email || ""}
              placeholder={messages.emailLabel}
              aria-label={messages.emailLabel}
            />
            <label className="flex items-start gap-2 text-xs text-ss-muted">
              <input
                name="consent"
                type="checkbox"
                defaultChecked={keepTexting}
                className="mt-0.5"
              />
              <span>{messages.keepTextingConsent}</span>
            </label>
            <p className="text-[0.68rem] leading-snug text-ss-muted">
              {messages.smsLegalFooter}{" "}
              <a
                href="https://www.estatesnipe.com/privacy"
                className="text-ss-accent2 underline"
              >
                Privacy
              </a>{" "}
              ·{" "}
              <a
                href="https://www.estatesnipe.com/terms"
                className="text-ss-accent2 underline"
              >
                Terms
              </a>
              .
            </p>
            <button
              type="submit"
              className="btn-primary w-full py-3 text-sm font-bold"
            >
              {messages.keepTextingCta}
            </button>
          </form>

          <div className="mt-3 border-t border-ss-line pt-3 text-center">
            {founderPro ? (
              <>
                <p className="mb-1 text-sm font-bold text-ss-accent">
                  Pro unlocked for testing
                </p>
                <p className="text-xs text-ss-muted">
                  Founder Pro · no checkout needed
                </p>
              </>
            ) : (
              <>
                <p className="mb-2 text-sm text-ss-muted">
                  {messages.upgradeBlurb}
                </p>
                <CheckoutButton label={messages.upgradeCta} />
              </>
            )}
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="mb-3 flex min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-ss-line bg-ss-card p-3.5 shadow-[0_8px_28px_rgba(33,29,23,0.06)]">
        {empty ? (
          <div className="flex flex-1 flex-col justify-center gap-4 py-6">
            <button
              type="button"
              onClick={() => focusComposer(inputRef.current)}
              className="mx-auto w-full max-w-[94%] cursor-text rounded-2xl border border-ss-line bg-ss-bg px-4 py-5 text-left transition hover:border-ss-accent"
            >
              <p className="mb-1 text-lg font-bold">{messages.chatEmptyHello}</p>
              <p className="text-sm text-ss-muted">{messages.chatEmptyHint}</p>
              <p className="mt-2 text-[0.72rem] font-semibold text-ss-accent2">
                {messages.chatIntroTap}
              </p>
            </button>
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => onExample(p)}
                  className="rounded-2xl border border-ss-line bg-ss-bg px-3.5 py-3 text-left text-[0.88rem] leading-snug text-ss-text transition hover:border-ss-accent disabled:opacity-60"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <div
                className={`max-w-[94%] rounded-2xl px-3 py-2 text-[0.92rem] leading-snug ${
                  m.role === "user"
                    ? "ml-auto rounded-br-md bg-ss-accent text-white"
                    : "mr-auto rounded-bl-md bg-ss-bg text-ss-text ring-1 ring-ss-line"
                }`}
              >
                <div className="mb-0.5 text-[0.68rem] font-semibold opacity-70">
                  {m.role === "user" ? messages.chatYou : messages.chatAssistant}
                </div>
                <span className="whitespace-pre-line">{m.text}</span>
                {m.role === "assistant" && m.scanning ? (
                  <span className="ml-1 inline-block animate-pulse">●</span>
                ) : null}
              </div>
              {m.role === "assistant" && m.matches && m.matches.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const ordered = sortStopsForRoute(m.matches).slice(
                      0,
                      MAX_MAPS_STOPS
                    );
                    const multi = buildMultiStopMapsUrl(
                      ordered.map((x) => x.listing)
                    );
                    const count = ordered.length;
                    const label = messages.routeTheseSalesCount
                      ? messages.routeTheseSalesCount.replace(
                          "{count}",
                          String(count)
                        )
                      : `Route these ${count} sales`;
                    return multi ? (
                      <a
                        href={multi}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sticky top-0 z-20 flex w-full items-center justify-center gap-2 rounded-[8px] bg-ss-accent px-3 py-3.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(15,118,110,0.25)]"
                      >
                        <span aria-hidden>↗</span>
                        {label}
                      </a>
                    ) : null;
                  })()}
                  <ul className="space-y-3">
                    {m.matches.map((match) => (
                      <MatchCard
                        key={match.listing.id}
                        listing={match.listing}
                        matchedKeywords={match.matchedKeywords}
                        matchSource={match.matchSource}
                        visionConfidence={match.visionConfidence}
                        visionReason={match.visionReason}
                        isNew={match.isNew}
                        outsideRadius={match.outsideRadius}
                        radiusMiles={m.radiusMiles ?? profileRadius}
                        showRoute
                        flipMode={match.flipMode ?? flipModeActive}
                        itemGuess={match.itemGuess}
                        portable={match.portable}
                        flipNotes={match.flipNotes}
                        flipValueLabel={match.flipValueLabel}
                        ebayConfigured={match.ebayConfigured}
                        ebayCompsNote={match.ebayCompsNote}
                        sellThroughPct={match.sellThroughPct}
                        clearsMinAlert={match.clearsMinAlert}
                        minAlertValueUsd={
                          match.minAlertValueUsd ?? minAlertValueUsd
                        }
                        labels={{
                          matchFromPhotos: messages.matchFromPhotos,
                          matchFromBoth: messages.matchFromBoth,
                          scanNew: messages.scanNew,
                          viewSale: messages.viewSale,
                          routeToSale: messages.routeToSale,
                          noPhoto: messages.noPhoto,
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative z-30 sticky bottom-0 rounded-[20px] border border-ss-line bg-ss-card p-3.5 shadow-[0_-8px_28px_rgba(33,29,23,0.1)]"
      >
        <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-ss-accent2">
          {messages.chatHomeTitle}
        </label>
        <textarea
          ref={inputRef}
          name="hunt"
          rows={3}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={messages.chatHomePlaceholder}
          className="relative z-30 mb-2 w-full resize-none rounded-xl border-2 border-ss-line bg-ss-input px-3.5 py-3 text-[16px] leading-snug text-ss-text outline-none touch-manipulation select-text focus:border-ss-accent"
          style={{ WebkitUserSelect: "text", pointerEvents: "auto", position: "relative" }}
          aria-label={messages.chatHomePlaceholder}
          readOnly={false}
          disabled={false}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.68rem] text-ss-muted">
            {profileZip
              ? `${profileZip} · ${profileRadius} mi`
              : messages.chatZipHint}
          </p>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="btn-primary shrink-0 px-5 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {busy ? messages.scanScanning : messages.chatSend}
          </button>
        </div>
      </form>

      <p className="mt-3 text-center text-xs">
        <Link href="/pricing" className="font-semibold text-ss-accent2">
          Free vs Pro
        </Link>
        {" · "}
        <button
          type="button"
          onClick={() => setAlertsOpen(true)}
          className="font-semibold text-ss-accent2"
        >
          {messages.keepTextingTitle}
        </button>
      </p>
    </div>
  );
}
