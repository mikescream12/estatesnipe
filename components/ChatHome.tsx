"use client";

import { useEffect, useRef, useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { useLocale } from "@/lib/LocaleContext";
import {
  applyHuntTurn,
  describeHunt,
  emptyHuntQuery,
  type HuntQuery,
  type SaleMode,
} from "@/lib/huntTurn";
import {
  executeHuntScan,
  type HuntListing,
  type HuntMatch,
  type HuntPostResult,
} from "@/lib/huntScan";
import { addWatches, deleteWatch, loadProfile, loadWatches, saveProfile, saveWatches, type Watch } from "@/lib/watches";
import { isFounderPhone } from "@/lib/founder";
import { parseFlipMention, parseMinAlertUsd } from "@/lib/flipValue";
import { buildMultiStopMapsUrl } from "@/lib/routePlan";
import { normalizePhone } from "@/lib/phone";
import { CheckoutButton } from "@/components/CheckoutButton";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  matches?: HuntMatch[];
  nearby?: HuntListing[];
  radiusMiles?: number;
};

const EXAMPLES = [
  "Find furniture within 10 miles of 92886",
  "Sterling and jewelry within 25 miles of 92886",
  "All sales this weekend near 92886",
];

function nextId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function postScan(
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<HuntPostResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason || "superseded");
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch("/api/watch/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) as HuntPostResult["data"] };
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      return {
        status: res.status,
        data: null,
        errorText: snippet || `the server responded ${res.status}`,
      };
    }
  } catch (err) {
    const reason = ctrl.signal.reason;
    if (reason === "timeout") {
      return {
        status: 0,
        data: null,
        errorText: `no answer after ${Math.round(timeoutMs / 1000)} seconds`,
      };
    }
    if (reason === "superseded") {
      return { status: 0, data: null, errorText: "superseded" };
    }
    return {
      status: 0,
      data: null,
      errorText: err instanceof Error ? err.message : "the request failed",
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function ChatHome() {
  const { locale, messages } = useLocale();
  const [query, setQuery] = useState<HuntQuery>(() => emptyHuntQuery());
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [savedNote, setSavedNote] = useState("");
  const [flipMode, setFlipMode] = useState(false);
  const [minAlert, setMinAlert] = useState<number | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [founder, setFounder] = useState(false);
  const flipRef = useRef(false);
  const alertRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const profile = loadProfile();
    if (profile?.zip && /^\d{5}$/.test(profile.zip)) {
      setQuery((q) =>
        emptyHuntQuery({
          ...q,
          zip: profile.zip,
          radiusMi: profile.radiusMi || q.radiusMi,
        })
      );
    }
    if (typeof profile?.minAlertValueUsd === "number" && profile.minAlertValueUsd > 0) {
      alertRef.current = profile.minAlertValueUsd;
      setMinAlert(profile.minAlertValueUsd);
    }
    setFounder(isFounderPhone(profile?.phone));
    setWatches(loadWatches());
    const savedMode = window.localStorage.getItem("estatesnipe.saleMode");
    if (savedMode === "estate" || savedMode === "auction" || savedMode === "both") {
      setQuery((q) => ({ ...q, saleMode: savedMode }));
    }
    void syncSaved();
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs]);

  useEffect(() => {
    return () => abortRef.current?.abort("superseded");
  }, []);

  function remember(next: HuntQuery) {
    const profile = loadProfile();
    saveProfile({
      phone: profile?.phone || "",
      email: profile?.email || "",
      zip: next.zip || profile?.zip || "",
      radiusMi: next.radiusMi,
      consentAlerts: Boolean(profile?.consentAlerts),
      consentMarketing: Boolean(profile?.consentMarketing),
      minAlertValueUsd: alertRef.current,
    });
  }

  function syncSaved() {
    const idKey = "estatesnipe.clientId.v1";
    let clientId = window.localStorage.getItem(idKey) || "";
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientId)) {
      clientId = crypto.randomUUID();
      window.localStorage.setItem(idKey, clientId);
    }
    const profile = loadProfile();
    const mode = window.localStorage.getItem("estatesnipe.saleMode");
    void fetch("/api/watch/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        phone: normalizePhone(profile?.phone || "") || profile?.phone || "",
        email: profile?.email || "",
        consentAlerts: Boolean(profile?.consentAlerts),
        consentMarketing: Boolean(profile?.consentMarketing),
        minAlertValueUsd: alertRef.current,
        saleMode: mode === "estate" || mode === "auction" || mode === "both" ? mode : "both",
        watches: loadWatches().map((w) => ({
          id: w.id,
          keyword: w.keyword,
          zip: w.zip,
          radiusMi: w.radiusMi,
          excludeAuctions: Boolean(w.excludeAuctions),
        })),
      }),
    }).catch(() => undefined);
  }

  async function scanWith(next: HuntQuery, preface?: string, botId?: string) {
    const id = botId || nextId();
    if (!botId) {
      setMsgs((m) => [
        ...m,
        {
          id,
          role: "assistant",
          pending: true,
          text: `${preface ? `${preface} ` : ""}Searching ${describeHunt(next, locale)}…`,
        },
      ]);
    }
    abortRef.current?.abort("superseded");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const profile = loadProfile();
    const phone = normalizePhone(profile?.phone || "") || profile?.phone || "";
    const outcome = await executeHuntScan(
      next,
      (body, timeoutMs) => postScan(body, timeoutMs, ctrl.signal),
      locale,
      preface,
      {
        flipMode: flipRef.current,
        minAlertValueUsd: alertRef.current,
        clientPhone: phone || undefined,
        notifyPhone: profile?.consentAlerts && phone ? phone : undefined,
        notifyEmail: profile?.consentAlerts && profile.email ? profile.email : undefined,
      }
    );
    const superseded = outcome.text.includes("superseded") && ctrl.signal.aborted;
    setMsgs((m) =>
      m.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              pending: false,
              text: superseded
                ? locale === "es"
                  ? "Paré esta búsqueda porque enviaste otro mensaje."
                  : "Stopped this search because you sent another message."
                : outcome.text,
              matches: superseded ? [] : outcome.matches,
              nearby: superseded ? [] : outcome.nearby,
              radiusMiles: outcome.radiusMiles,
            }
          : msg
      )
    );
  }

  async function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const flipMention = parseFlipMention(trimmed);
    if (flipMention === "on") {
      flipRef.current = true;
      setFlipMode(true);
    } else if (flipMention === "off") {
      flipRef.current = false;
      setFlipMode(false);
    }
    const alert = parseMinAlertUsd(trimmed);
    if (alert != null) {
      alertRef.current = alert;
      setMinAlert(alert);
    }
    setInput("");
    setSavedNote("");
    const turn = applyHuntTurn(queryRef.current, trimmed, locale, new Date());
    queryRef.current = turn.query;
    setQuery(turn.query);
    const userId = nextId();
    setMsgs((m) => [...m, { id: userId, role: "user", text: trimmed }]);
    if (turn.action === "ask") {
      setMsgs((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: turn.ask || "" },
      ]);
      return;
    }
    remember(turn.query);
    const botId = nextId();
    setMsgs((m) => [
      ...m,
      {
        id: botId,
        role: "assistant",
        pending: true,
        text: `${turn.preface ? `${turn.preface} ` : ""}Searching ${describeHunt(turn.query, locale)}…`,
      },
    ]);
    await scanWith(turn.query, turn.preface, botId);
  }

  function onMode(mode: SaleMode) {
    if (mode === queryRef.current.saleMode) return;
    const next: HuntQuery = { ...queryRef.current, saleMode: mode };
    queryRef.current = next;
    setQuery(next);
    window.localStorage.setItem("estatesnipe.saleMode", mode);
    syncSaved();
    const label =
      mode === "estate"
        ? "Estate sales only."
        : mode === "auction"
          ? "Auctions only."
          : "Estate sales and auctions.";
    if (/^\d{5}$/.test(next.zip) && (next.browseAll || next.keywords.length > 0)) {
      remember(next);
      const botId = nextId();
      setMsgs((m) => [
        ...m,
        {
          id: botId,
          role: "assistant",
          pending: true,
          text: `${label} Searching ${describeHunt(next, locale)}…`,
        },
      ]);
      void scanWith(next, label, botId);
    }
  }

  function saveWatch() {
    const q = queryRef.current;
    if (!/^\d{5}$/.test(q.zip) || (!q.browseAll && q.keywords.length === 0)) {
      setSavedNote(
        locale === "es"
          ? "Primero dime qué buscar y un código postal."
          : "Search for something with a zip first."
      );
      return;
    }
    const keywords = q.browseAll ? ["anything"] : q.keywords;
    addWatches(
      keywords.map((keyword) => ({
        keyword,
        zip: q.zip,
        radiusMi: q.radiusMi,
        excludeAuctions: q.saleMode === "estate",
      }))
    );
    remember(q);
    setWatches(loadWatches());
    syncSaved();
    setSavedNote(
      locale === "es"
        ? "Alertas guardadas. Las ves en Watches."
        : "Saved. They’re on the Watches page."
    );
  }

  const started = msgs.some((m) => m.role === "user");

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Hunt</h1>
          <p className="text-sm text-ss-muted">
            Say what you want. I’ll scan nearby sales and tell you exactly what I searched.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ss-brand-50 px-2.5 py-1 text-[0.72rem] font-bold text-ss-accent ring-1 ring-ss-brand-100">
            {founder ? "Pro" : "Free"}
          </span>
          <button
            type="button"
            onClick={() => setAlertsOpen((v) => !v)}
            className="rounded-2xl border border-ss-line bg-ss-card px-2.5 py-2 text-[0.72rem] font-semibold text-ss-muted"
          >
            Alerts{watches.length ? ` (${watches.length})` : ""}
          </button>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Sale type"
        >
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
              onClick={() => onMode(mode)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                query.saleMode === mode
                  ? "bg-ss-accent text-white"
                  : "bg-[#efebe3] text-ss-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {flipMode || minAlert != null ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {flipMode ? (
            <span className="rounded-full border border-ss-brand-100 bg-ss-brand-50 px-2.5 py-1 text-[0.7rem] font-bold text-ss-accent">
              Flip mode · portable
            </span>
          ) : null}
          {minAlert != null ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.7rem] font-bold text-amber-800">
              Alert ≥ ${minAlert}
            </span>
          ) : null}
        </div>
      ) : null}

      {alertsOpen ? (
        <div className="mb-3 rounded-[18px] border border-ss-line bg-ss-card p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">Alerts</h2>
            <button type="button" className="text-xs text-ss-muted" onClick={() => setAlertsOpen(false)}>
              Close
            </button>
          </div>
          {watches.length === 0 ? (
            <p className="mb-3 text-sm text-ss-muted">No saved alerts yet. Run a hunt, then save it.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {watches.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-ss-line bg-ss-bg px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold text-ss-accent">{w.keyword}</div>
                    <div className="text-[0.7rem] text-ss-muted">
                      {w.zip} · {w.radiusMi} mi{w.excludeAuctions ? " · skip auctions" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700"
                    onClick={() => {
                      const next = deleteWatch(w.id);
                      setWatches(next);
                      syncSaved();
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const phone = String(data.get("phone") || "");
              const email = String(data.get("email") || "");
              const zip = String(data.get("zip") || query.zip || "");
              const radius = Number(data.get("radius") || query.radiusMi || 25);
              const consent = data.get("consent") === "on";
              const rawMin = String(data.get("minAlertValue") || "none");
              const nextMin = rawMin !== "none" && Number(rawMin) > 0 ? Math.round(Number(rawMin)) : null;
              alertRef.current = nextMin;
              setMinAlert(nextMin);
              const profile = loadProfile();
              saveProfile({
                phone,
                email,
                zip: /^\d{5}$/.test(zip) ? zip : profile?.zip || "",
                radiusMi: radius,
                consentAlerts: consent,
                consentMarketing: Boolean(profile?.consentMarketing),
                minAlertValueUsd: nextMin,
              });
              if (/^\d{5}$/.test(zip)) {
                const next = { ...queryRef.current, zip, radiusMi: radius };
                queryRef.current = next;
                setQuery(next);
              }
              setFounder(isFounderPhone(phone));
              const moved = loadWatches().map((w) => ({
                ...w,
                zip: /^\d{5}$/.test(zip) ? zip : w.zip,
                radiusMi: radius,
              }));
              saveWatches(moved);
              setWatches(moved);
              syncSaved();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <input name="zip" defaultValue={query.zip} placeholder="Zip" aria-label="Zip" />
              <input
                name="radius"
                type="number"
                min={1}
                max={founder ? 100 : 25}
                defaultValue={query.radiusMi}
                placeholder="mi"
                aria-label="Radius"
              />
            </div>
            <label className="block text-[0.72rem] font-semibold text-ss-muted">
              Min alert value (USD)
              <select
                name="minAlertValue"
                defaultValue={minAlert != null ? String(minAlert) : "none"}
                className="mt-1"
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
              Opt-in: only text/email when estimated flip value clears this bar. Or say “only text me if worth $80+” in chat.
            </p>
            <input name="phone" type="tel" defaultValue={loadProfile()?.phone || ""} placeholder="Phone" aria-label="Phone" />
            <input name="email" type="email" defaultValue={loadProfile()?.email || ""} placeholder="Email" aria-label="Email" />
            <label className="flex items-start gap-2 text-xs text-ss-muted">
              <input name="consent" type="checkbox" defaultChecked={Boolean(loadProfile()?.consentAlerts)} className="mt-0.5" />
              <span>
                I agree to receive EstateSnipe match-alert SMS. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
              </span>
            </label>
            <button type="submit" className="btn-primary w-full py-3 text-sm font-bold">
              Save alerts
            </button>
            {founder ? (
              <p className="text-center text-xs text-ss-muted">Founder Pro · no checkout needed</p>
            ) : (
              <div className="border-t border-ss-line pt-3 text-center">
                <CheckoutButton label="Upgrade to Pro" />
              </div>
            )}
          </form>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-ss-line bg-ss-card px-2.5 py-1 font-semibold">
          {query.zip || "No zip yet"}
        </span>
        <span className="rounded-full border border-ss-line bg-ss-card px-2.5 py-1 font-semibold">
          {query.radiusMi} mi
        </span>
        <span className="rounded-full border border-ss-line bg-ss-card px-2.5 py-1">
          {query.browseAll
            ? "all sales"
            : query.keywords.length
              ? query.keywords.join(", ")
              : "no keywords yet"}
          {query.whenLabel ? ` · ${query.whenLabel}` : ""}
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="flex max-h-[min(70vh,760px)] min-h-[260px] flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-ss-line bg-ss-card p-3 shadow-[0_8px_28px_rgba(33,29,23,0.06)] sm:p-4"
        aria-live="polite"
      >
        {!started ? (
          <div className="flex flex-1 flex-col justify-center gap-3 py-4">
            <button
              type="button"
              onClick={() => boxRef.current?.focus()}
              className="rounded-2xl border border-ss-line bg-ss-bg px-4 py-4 text-left"
            >
              <p className="text-lg font-bold">What are we hunting?</p>
              <p className="text-sm text-ss-muted">
                Tap an example or type like you’d text a friend.
              </p>
            </button>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void submitText(example)}
                  className="rounded-2xl border border-ss-line bg-ss-bg px-3.5 py-3 text-left text-sm leading-snug hover:border-ss-accent"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <div
              className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[0.95rem] leading-snug md:max-w-[75%] ${
                m.role === "user"
                  ? "ml-auto rounded-br-md bg-[#0f766e] text-white"
                  : "mr-auto rounded-bl-md border border-ss-line bg-ss-bg text-ss-text"
              }`}
            >
              <div className="mb-0.5 text-[0.68rem] font-semibold opacity-70">
                {m.role === "user" ? messages.chatYou : "EstateSnipe"}
              </div>
              {m.text}
              {m.pending ? (
                <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-ss-accent" />
              ) : null}
            </div>
            {m.matches && m.matches.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const route = buildMultiStopMapsUrl(
                    [...m.matches]
                      .sort((a, b) => (a.listing.distanceMiles ?? 999) - (b.listing.distanceMiles ?? 999))
                      .slice(0, 9)
                      .map((hit) => hit.listing)
                  );
                  const count = Math.min(m.matches.length, 9);
                  return route ? (
                    <a
                      href={route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sticky top-0 z-20 flex w-full items-center justify-center gap-2 rounded-[8px] bg-ss-accent px-3 py-3.5 text-sm font-bold text-white"
                    >
                      <span aria-hidden>↗</span>
                      Route these {count} sales
                    </a>
                  ) : null;
                })()}
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {m.matches.slice(0, 8).map((hit) => (
                    <MatchCard
                      key={hit.listing.id}
                      listing={hit.listing}
                      matchedKeywords={hit.matchedKeywords}
                      matchSource={hit.matchSource}
                      visionConfidence={hit.visionConfidence}
                      visionReason={hit.visionReason}
                      isNew={hit.isNew}
                      outsideRadius={hit.outsideRadius}
                      radiusMiles={m.radiusMiles}
                      showRoute
                      flipMode={hit.flipMode ?? flipMode}
                      itemGuess={hit.itemGuess}
                      portable={hit.portable}
                      flipNotes={hit.flipNotes}
                      flipValueLabel={hit.flipValueLabel}
                      ebayConfigured={hit.ebayConfigured}
                      ebayCompsNote={hit.ebayCompsNote}
                      sellThroughPct={hit.sellThroughPct}
                      clearsMinAlert={hit.clearsMinAlert}
                      minAlertValueUsd={hit.minAlertValueUsd ?? minAlert}
                      labels={{
                        matchFromPhotos: messages.matchFromPhotos,
                        matchFromBoth: messages.matchFromBoth,
                        scanNew: messages.scanNew,
                        viewSale: messages.viewSale,
                        routeToSale: "Route to sale",
                        noPhoto: messages.noPhoto,
                      }}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {m.nearby && m.nearby.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ss-muted">
                  Closest sales in range
                </p>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {m.nearby.map((listing) => (
                    <MatchCard
                      key={listing.id}
                      listing={listing}
                      radiusMiles={m.radiusMiles}
                      labels={{
                        matchFromPhotos: messages.matchFromPhotos,
                        matchFromBoth: messages.matchFromBoth,
                        viewSale: messages.viewSale,
                        noPhoto: messages.noPhoto,
                      }}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitText(input);
        }}
        className="sticky bottom-0 z-10 mt-3 rounded-[20px] border border-ss-line bg-ss-card p-3 shadow-[0_-8px_28px_rgba(33,29,23,0.08)]"
      >
        <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-ss-accent">
          Hunt
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            ref={boxRef}
            name="hunt"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitText(input);
              }
            }}
            placeholder="Ask for sales near you…"
            aria-label="Ask for sales near you…"
            className="min-h-[52px] flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-primary shrink-0 px-5 py-3 text-sm disabled:opacity-50"
          >
            {messages.chatSend}
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.72rem] text-ss-muted">
            Follow-ups keep your zip, miles, and keywords. Shift+Enter for a new line.
          </p>
          <button
            type="button"
            onClick={saveWatch}
            className="text-left text-xs font-semibold text-ss-accent"
          >
            Save this hunt as alerts
          </button>
        </div>
        {savedNote ? <p className="mt-1 text-xs text-ss-muted">{savedNote}</p> : null}
      </form>
    </div>
  );
}
