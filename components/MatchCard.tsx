"use client";

import { useState } from "react";

export type MatchCardListing = {
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

export type MatchCardProps = {
  listing: MatchCardListing;
  matchedKeywords?: string[];
  matchSource?: "text" | "photo" | "both";
  visionConfidence?: number;
  visionReason?: string;
  isNew?: boolean;
  outsideRadius?: boolean;
  radiusMiles?: number | string;
  labels: {
    matchFromPhotos: string;
    matchFromBoth: string;
    scanNew?: string;
    viewSale?: string;
    noPhoto?: string;
  };
};

function photoSrc(
  p?: { url: string; thumbnailUrl?: string } | null
): string | null {
  if (!p) return null;
  const u = (p.url || p.thumbnailUrl || "").trim();
  return u && /^https?:\/\//i.test(u) ? u : null;
}

function uniquePhotos(
  photos: Array<{ url: string; thumbnailUrl?: string }> | undefined,
  max = 4
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of photos || []) {
    const u = photoSrc(p);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

function SourceLabel({ sourceId }: { sourceId: string }) {
  const pretty =
    sourceId === "estatesales.net"
      ? "EstateSales.net"
      : sourceId === "estatesales.org"
        ? "EstateSales.org"
        : sourceId;
  return <span>{pretty}</span>;
}

export function MatchCard({
  listing,
  matchedKeywords = [],
  matchSource,
  visionConfidence,
  visionReason,
  isNew,
  outsideRadius,
  radiusMiles,
  labels,
}: MatchCardProps) {
  const urls = uniquePhotos(listing.photos, 4);
  const hero = urls[0] || null;
  const thumbs = urls.slice(1, 4);
  const [heroBroken, setHeroBroken] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<number, boolean>>({});

  const showHero = hero && !heroBroken;
  const isPhotoMatch = matchSource === "photo" || matchSource === "both";

  return (
    <li className="overflow-hidden rounded-2xl border border-ss-line bg-[#0b0d11] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-inherit no-underline"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-[#1a2030] via-[#12151b] to-[#0b0d11]">
          {showHero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
              onError={() => setHeroBroken(true)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-ss-line bg-[rgba(255,255,255,0.04)] text-ss-muted">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                  <path
                    d="M4.5 16.5 9 12l3 3 3.5-4.5 4 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-[0.72rem] font-medium tracking-wide text-ss-muted">
                {labels.noPhoto || "Photo coming soon"}
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />

          <div className="absolute left-2.5 top-2.5 flex max-w-[90%] flex-wrap gap-1.5">
            {outsideRadius ? (
              <span className="rounded-full border border-red-500/50 bg-[rgba(80,16,16,0.88)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-red-300 shadow-sm backdrop-blur-sm">
                Soft outside
                {listing.distanceMiles != null
                  ? ` · ${listing.distanceMiles} mi`
                  : ""}
              </span>
            ) : null}
            {isPhotoMatch ? (
              <span className="rounded-full border border-ss-accent2/40 bg-[rgba(13,18,24,0.82)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ss-accent2 shadow-sm backdrop-blur-sm">
                {matchSource === "both"
                  ? labels.matchFromBoth
                  : labels.matchFromPhotos}
                {visionConfidence != null
                  ? ` · ${Math.round(visionConfidence * 100)}%`
                  : ""}
              </span>
            ) : null}
            {isNew && labels.scanNew ? (
              <span className="rounded-full border border-ss-accent/40 bg-[rgba(13,18,24,0.82)] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ss-accent shadow-sm backdrop-blur-sm">
                {labels.scanNew}
              </span>
            ) : null}
            {!outsideRadius && listing.distanceMiles != null ? (
              <span className="rounded-full border border-white/15 bg-[rgba(13,18,24,0.75)] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-white/90 shadow-sm backdrop-blur-sm">
                {listing.distanceMiles} mi
              </span>
            ) : null}
          </div>

          <div className="absolute bottom-2.5 left-3 right-3">
            <div className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-white drop-shadow">
              {listing.title}
            </div>
          </div>
        </div>

        {thumbs.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5 bg-[#0b0d11] px-2.5 pt-2.5">
            {thumbs.map((src, i) => (
              <div
                key={`${listing.id}-t-${i}`}
                className="relative aspect-[4/3] overflow-hidden rounded-lg border border-ss-line bg-[#12151b]"
              >
                {!brokenThumbs[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                    onError={() =>
                      setBrokenThumbs((prev) => ({ ...prev, [i]: true }))
                    }
                  />
                ) : (
                  <div className="h-full w-full bg-[#151922]" />
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-1.5 px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-ss-muted">
            <SourceLabel sourceId={listing.sourceId} />
            {!outsideRadius && listing.distanceMiles != null ? (
              <>
                <span className="text-ss-line">·</span>
                <span>{listing.distanceMiles} mi</span>
              </>
            ) : null}
            {listing.city || listing.state || listing.zip ? (
              <>
                <span className="text-ss-line">·</span>
                <span>
                  {[listing.city, listing.state, listing.zip]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </>
            ) : null}
          </div>

          {!isPhotoMatch && matchedKeywords.length > 0 ? (
            <div className="text-[0.72rem] text-ss-muted">
              {matchedKeywords.slice(0, 4).join(" · ")}
            </div>
          ) : null}

          {isPhotoMatch && visionReason ? (
            <p className="text-[0.75rem] leading-snug text-ss-muted">
              {visionReason}
            </p>
          ) : null}

          {outsideRadius ? (
            <p className="text-[0.72rem] text-red-300/90">
              {`Slightly outside your ${radiusMiles ?? "?"} mi radius`}
              {listing.distanceMiles != null
                ? ` · ${listing.distanceMiles} mi away`
                : ""}
            </p>
          ) : null}

          <div className="pt-0.5 text-[0.72rem] font-semibold text-ss-accent">
            {labels.viewSale || "View sale →"}
          </div>
        </div>
      </a>
    </li>
  );
}
