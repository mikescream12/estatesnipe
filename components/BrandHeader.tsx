"use client";

import Link from "next/link";
import { useLocale } from "@/lib/LocaleContext";

export function BrandHeader({ showLang = true }: { showLang?: boolean }) {
  const { locale, toggleLocale, messages } = useLocale();

  return (
    <div className="mb-[18px] flex items-center justify-between">
      <Link href="/" className="text-[1.25rem] font-extrabold tracking-tight">
        Sale<span className="text-ss-accent">Snipe</span>
      </Link>
      {showLang ? (
        <button
          type="button"
          onClick={toggleLocale}
          className="rounded-full border border-ss-line bg-ss-card px-2.5 py-1.5 text-xs text-ss-muted"
          aria-label="Toggle language"
        >
          {messages.langToggleHint} · {locale.toUpperCase()}
        </button>
      ) : null}
    </div>
  );
}
