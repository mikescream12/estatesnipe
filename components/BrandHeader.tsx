"use client";

import Link from "next/link";
import { useLocale } from "@/lib/LocaleContext";

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 22s7-7.2 7-12.2A7 7 0 1 0 5 9.8C5 14.8 12 22 12 22Z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="12" cy="9.5" r="2.6" fill="#FAF9F6" />
    </svg>
  );
}

export function BrandHeader({ showLang = true }: { showLang?: boolean }) {
  const { locale, toggleLocale, messages } = useLocale();

  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 text-[1.2rem] font-extrabold tracking-tight text-ss-text"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ss-brand-50 text-ss-accent ring-1 ring-ss-brand-100">
          <PinIcon />
        </span>
        <span className="truncate tracking-[-0.02em]">
          Estate<span className="text-ss-accent">Snipe</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {showLang ? (
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded-full border border-ss-line bg-ss-card px-2.5 py-1.5 text-[0.7rem] font-semibold text-ss-muted"
            aria-label="Toggle language"
          >
            {locale.toUpperCase()}
          </button>
        ) : null}
        <Link
          href="/pricing"
          className="btn-ink px-3 py-2 text-[0.75rem] font-bold no-underline"
        >
          Free vs Pro
        </Link>
      </div>
    </div>
  );
}
