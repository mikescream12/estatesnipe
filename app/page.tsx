"use client";

import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { ContactConsentForm } from "@/components/ContactConsentForm";
import { ChatHome } from "@/components/ChatHome";
import { InstallBanner } from "@/components/InstallBanner";
import { PhoneShell } from "@/components/PhoneShell";
import { useLocale } from "@/lib/LocaleContext";

export default function LandingPage() {
  const { messages } = useLocale();

  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />

      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <span className="rounded-xl border border-ss-accent2 bg-[rgba(61,214,198,0.1)] px-2 py-2.5 text-center text-xs font-semibold text-ss-text">
          {messages.tabChat}
        </span>
        <Link
          href="/app"
          className="rounded-xl border border-ss-line px-2 py-2.5 text-center text-xs font-semibold text-ss-muted"
        >
          {messages.navHome}
        </Link>
        <Link
          href="/app/sample-alert"
          className="rounded-xl border border-ss-line px-2 py-2.5 text-center text-xs font-semibold text-ss-muted"
        >
          {messages.tabAlert}
        </Link>
      </div>

      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        {messages.heroTitle}
      </h1>
      <p className="mb-4 text-[0.95rem] text-ss-muted">{messages.heroSub}</p>

      <video
        className="mb-2 w-full overflow-hidden rounded-[18px] border border-ss-line bg-black"
        src="/demo.mp4"
        autoPlay
        muted
        loop
        playsInline
        controls
      />
      <p className="mb-4 text-center text-[0.72rem] text-ss-muted">
        Example: search a keyword, then the text that hits the phone.
      </p>

      <div className="mb-4">
        <ChatHome />
      </div>

      <p className="mb-3 whitespace-pre-line text-center text-[0.72rem] text-ss-muted">
        {messages.finePrint}
      </p>
      <p className="mb-3 text-center text-xs">
        <Link href="/pricing" className="font-semibold text-ss-accent2">
          Free vs Pro
        </Link>
      </p>

      <details className="mb-3 rounded-[18px] border border-ss-line bg-ss-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ss-muted">
          {messages.signupDetails}
        </summary>
        <p className="mt-2 text-xs text-ss-muted">{messages.signupDetailsBlurb}</p>
        <ContactConsentForm />
      </details>

      <Link
        href="/app/sample-alert"
        className="block w-full rounded-[14px] border border-ss-line py-3.5 text-center text-base font-bold text-ss-text"
      >
        {messages.ctaSample}
      </Link>
    </PhoneShell>
  );
}
