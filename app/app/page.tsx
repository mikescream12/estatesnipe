"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { InstallBanner } from "@/components/InstallBanner";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useLocale } from "@/lib/LocaleContext";
import { clampRadiusMiles, gateListing, preferredZip } from "@/lib/geoPure";
import {
  addWatch,
  deleteWatch,
  loadProfile,
  loadWatches,
  saveProfile,
  saveWatches,
  type Watch,
} from "@/lib/watches";
import { MatchCard } from "@/components/MatchCard";

type ScanMatch = {
  listing: {
    id: string;
    title: string;
    url: string;
    sourceId: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
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
};

export default function AppHomePage() {
  const { messages } = useLocale();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [keyword, setKeyword] = useState("");
  const [zip, setZip] = useState("");
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
    const z = preferredZip(zip, null);
    if (!keyword.trim() || !z) {
      setToast("Enter a keyword and a 5-digit zip.");
      setTimeout(() => setToast(""), 2500);
      return;
    }
    const next = addWatch({
      keyword: keyword.trim(),
      zip: z,
      radiusMi: clampRadiusMiles(radiusMi, 25),
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
    // Visible zip wins. A saved Dallas profile must not override the field.
    const scanZip = preferredZip(zip, null);
    const scanRadius = clampRadiusMiles(radiusMi, 25);
    if (!/^\d{5}$/.test(scanZip)) {
      setToast("Enter a 5-digit US zip. Scanning without one is disabled.");
      setTimeout(() => setToast(""), 3000);
      return;
    }
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
      if (data.matches) {
        data.matches = data.matches.filter((m) =>
          gateListing({
            origin: { zip: scanZip, state: "" },
            radiusMi: scanRadius,
            coordDistanceMiles:
              typeof m.listing.distanceMiles === "number"
                ? m.listing.distanceMiles
                : null,
            listingState: m.listing.state,
            listingZip: m.listing.zip,
            listingUrl: m.listing.url,
          }).include
        );
        data.matchCount = data.matches.length;
      }
      if (profile) {
        saveProfile({ ...profile, zip: scanZip, radiusMi: scanRadius });
      }
      if (watches.length) {
        const synced = watches.map((w) => ({
          ...w,
          zip: scanZip,
          radiusMi: scanRadius,
        }));
        saveWatches(synced);
        setWatches(synced);
      }
      setScanResult(data);
      if (data.ok) {
        setToast(
          `${messages.scanDone} · ${data.matchCount ?? 0} ${messages.scanMatches}`
        );
      } else {
        setToast(data.error || messages.scanFailed);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : messages.scanFailed;
      setToast(message);
      setScanResult({ ok: false, error: message });
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
      <p className="mb-3 text-center text-xs">
        <Link href="/pricing" className="font-semibold text-ss-accent2">
          Free vs Pro
        </Link>
      </p>

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
        <div className="mb-4 rounded-[20px] border border-ss-line bg-ss-card p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <div className="mb-2 text-xs text-ss-muted">
            {messages.scanSources}:{" "}
            {(scanResult.sources || [])
              .map((s) =>
                s.ok
                  ? `${s.sourceId} (${s.listingCount})`
                  : `${s.sourceId} failed${s.reason ? `: ${s.reason}` : ""}`
              )
              .join(" · ")}
          </div>
          {scanResult.vision?.visionEnabled || scanResult.vision?.enabled ? (
            <div className="mb-2 text-xs text-ss-accent2">
              Vision: {scanResult.vision.matched ?? 0}/
              {scanResult.vision.evaluated ?? 0} photo matches
            </div>
          ) : scanResult.vision?.skippedReason &&
            scanResult.vision.skippedReason !== "pro_required" ? (
            <div className="mb-2 text-xs text-ss-muted">
              Vision skipped: {scanResult.vision.skippedReason}
            </div>
          ) : null}
          {(scanResult.matches || []).length === 0 ? (
            <p className="text-sm text-ss-muted">{messages.scanNoMatches}</p>
          ) : (
            <ul className="space-y-3.5">
              {(scanResult.matches || []).slice(0, 8).map((m) => (
                <MatchCard
                  key={m.listing.id}
                  listing={m.listing}
                  matchedKeywords={m.matchedKeywords}
                  matchSource={m.matchSource}
                  visionConfidence={m.visionConfidence}
                  visionReason={m.visionReason}
                  isNew={m.isNew}
                  outsideRadius={m.outsideRadius}
                  radiusMiles={scanResult.radiusMiles ?? radiusMi}
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
        <Link
          href="/subscribe"
          className="block w-full rounded-[14px] border border-ss-accent px-4 py-3 font-bold text-ss-accent"
        >
          {messages.upgradeCta}
        </Link>
      </div>
    </PhoneShell>
  );
}
