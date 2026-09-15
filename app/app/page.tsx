"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { InstallBanner } from "@/components/InstallBanner";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useLocale } from "@/lib/LocaleContext";
import {
  addWatch,
  deleteWatch,
  loadProfile,
  loadWatches,
  type Watch,
} from "@/lib/watches";

type ScanMatch = {
  listing: {
    id: string;
    title: string;
    url: string;
    sourceId: string;
    city?: string | null;
    distanceMiles?: number | null;
    photos?: Array<{ url: string; thumbnailUrl?: string }>;
  };
  matchedWatch: string;
  matchedKeywords: string[];
  score: number;
  isNew: boolean;
};

type ScanResult = {
  ok: boolean;
  error?: string;
  listingCount?: number;
  matchCount?: number;
  newMatchCount?: number;
  matches?: ScanMatch[];
  sources?: Array<{
    sourceId: string;
    ok: boolean;
    listingCount: number;
    reason?: string;
  }>;
};

export default function AppHomePage() {
  const { messages } = useLocale();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [keyword, setKeyword] = useState("");
  const [zip, setZip] = useState("75201");
  const [radiusMi, setRadiusMi] = useState("25");
  const [toast, setToast] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    setWatches(loadWatches());
    const profile = loadProfile();
    if (profile?.zip) setZip(profile.zip);
    if (profile?.radiusMi) setRadiusMi(String(profile.radiusMi));
  }, []);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    const next = addWatch({
      keyword: keyword.trim(),
      zip: zip.trim() || "75201",
      radiusMi: Math.max(1, parseInt(radiusMi, 10) || 25),
    });
    setWatches(next);
    setKeyword("");
    setToast(messages.savedToast);
    setTimeout(() => setToast(""), 2500);
  }

  function onDelete(id: string) {
    setWatches(deleteWatch(id));
  }

  async function onScanNow() {
    const profile = loadProfile();
    const scanZip =
      (profile?.zip || zip || watches[0]?.zip || "75201").trim() || "75201";
    const scanRadius =
      profile?.radiusMi ||
      watches[0]?.radiusMi ||
      Math.max(1, parseInt(radiusMi, 10) || 25);
    const watchTexts =
      watches.length > 0
        ? watches.map((w) => w.keyword)
        : keyword.trim()
          ? [keyword.trim()]
          : [];

    if (watchTexts.length === 0) {
      setToast(messages.scanNeedWatches);
      setTimeout(() => setToast(""), 3000);
      return;
    }

    setScanning(true);
    setScanResult(null);
    setToast("");
    try {
      const res = await fetch("/api/watch/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip: scanZip,
          radiusMiles: scanRadius,
          watchTexts,
          onlyNew: false,
          notifyPhone: profile?.consentAlerts ? profile.phone : undefined,
        }),
      });
      const data = (await res.json()) as ScanResult;
      setScanResult(data);
      if (data.ok) {
        setToast(
          `${messages.scanDone} · ${data.matchCount ?? 0} ${messages.scanMatches}`
        );
      } else {
        setToast(data.error || messages.scanFailed);
      }
    } catch {
      setToast(messages.scanFailed);
      setScanResult({ ok: false, error: messages.scanFailed });
    } finally {
      setScanning(false);
      setTimeout(() => setToast(""), 4000);
    }
  }

  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />
      <AppNav />

      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">{messages.appTitle}</h1>
        <span className="rounded-full bg-[rgba(61,214,198,0.15)] px-2 py-1 text-[0.72rem] font-bold text-ss-accent2">
          {messages.proBadge}
        </span>
      </div>

      {toast ? (
        <p className="mb-3 rounded-xl border border-ss-line bg-ss-card px-3 py-2 text-xs text-ss-accent2">
          {toast}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onScanNow}
        disabled={scanning}
        className="mb-4 w-full rounded-[14px] border border-ss-accent2 bg-[rgba(61,214,198,0.12)] py-3.5 text-base font-bold text-ss-accent2 disabled:opacity-60"
      >
        {scanning ? messages.scanScanning : messages.scanNow}
      </button>

      {scanResult?.ok ? (
        <div className="mb-4 rounded-[18px] border border-ss-line bg-ss-card p-3.5">
          <div className="mb-2 text-xs text-ss-muted">
            {messages.scanSources}:{" "}
            {(scanResult.sources || [])
              .map(
                (s) =>
                  `${s.sourceId} (${s.listingCount}${s.ok ? "" : " !"})`
              )
              .join(" · ")}
          </div>
          {(scanResult.matches || []).length === 0 ? (
            <p className="text-sm text-ss-muted">{messages.scanNoMatches}</p>
          ) : (
            <ul className="space-y-2">
              {(scanResult.matches || []).slice(0, 8).map((m) => (
                <li
                  key={m.listing.id}
                  className="rounded-xl border border-ss-line bg-[#0b0d11] p-3"
                >
                  <a
                    href={m.listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-ss-accent underline-offset-2 hover:underline"
                  >
                    {m.listing.title}
                  </a>
                  <div className="mt-1 text-xs text-ss-muted">
                    {m.matchedKeywords.join(", ")} · {m.listing.sourceId}
                    {m.listing.distanceMiles != null
                      ? ` · ${m.listing.distanceMiles} mi`
                      : ""}
                    {m.isNew ? ` · ${messages.scanNew}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {watches.length === 0 ? (
        <p className="mb-4 text-sm text-ss-muted">{messages.appEmpty}</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {watches.map((w) => (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 rounded-[18px] border border-ss-line bg-ss-card p-3.5"
            >
              <div>
                <div className="font-semibold text-ss-accent">{w.keyword}</div>
                <div className="text-xs text-ss-muted">
                  {w.zip} · {w.radiusMi} mi
                  {w.excludeAuctions ? " · skip auctions" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(w.id)}
                className="shrink-0 text-xs font-semibold text-ss-danger"
              >
                {messages.deleteWatch}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onAdd}
        className="mb-4 rounded-[18px] border border-ss-line bg-ss-card p-4"
      >
        <label className="field-label">{messages.watchKeyword}</label>
        <input
          type="text"
          className="mb-3"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={messages.customPlaceholder}
        />
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div>
            <label className="field-label">{messages.watchZip}</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">{messages.watchRadius}</label>
            <input
              type="number"
              value={radiusMi}
              onChange={(e) => setRadiusMi(e.target.value)}
              min={1}
            />
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-[14px] bg-gradient-to-br from-ss-accent to-[#f0c27b] py-3.5 text-base font-bold text-[#1a1208]"
        >
          {messages.addWatch}
        </button>
        <Link
          href="/app/chat"
          className="mt-2.5 block w-full rounded-[14px] border border-ss-line py-3 text-center text-sm font-bold text-ss-text"
        >
          {messages.ctaChat}
        </Link>
      </form>

      <div className="rounded-[18px] border border-ss-line bg-ss-card p-4 text-center">
        <p className="mb-2 text-sm text-ss-muted">{messages.upgradeBlurb}</p>
        <button
          type="button"
          className="w-full rounded-[14px] border border-ss-accent px-4 py-3 font-bold text-ss-accent"
          onClick={() =>
            alert("Stripe checkout — future. This is a demo shell.")
          }
        >
          {messages.upgradeCta}
        </button>
      </div>
    </PhoneShell>
  );
}
