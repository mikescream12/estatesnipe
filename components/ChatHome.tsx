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
import { addWatches, loadProfile, saveProfile } from "@/lib/watches";

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
    });
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
    const outcome = await executeHuntScan(
      next,
      (body, timeoutMs) => postScan(body, timeoutMs, ctrl.signal),
      locale,
      preface
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
                    labels={{
                      matchFromPhotos: messages.matchFromPhotos,
                      matchFromBoth: messages.matchFromBoth,
                      scanNew: messages.scanNew,
                      viewSale: messages.viewSale,
                      noPhoto: messages.noPhoto,
                    }}
                  />
                ))}
              </ul>
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
