"use client";

import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { useLocale } from "@/lib/LocaleContext";

export default function SampleAlertPage() {
  const { messages } = useLocale();

  return (
    <PhoneShell>
      <BrandHeader />
      <AppNav />

      <div className="mb-2.5 inline-block rounded-full bg-[rgba(61,214,198,0.15)] px-2 py-1 text-[0.72rem] font-bold text-ss-accent2">
        {messages.alertPill}
      </div>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        {messages.alertTitle}
      </h1>
      <p className="mb-5 text-[0.95rem] text-ss-muted">{messages.alertSub}</p>

      <div className="rounded-[18px] border border-ss-line bg-[#0b0d11] p-3.5">
        <div className="ml-auto max-w-[92%] rounded-[18px] rounded-br-md bg-[#1f6feb] p-3 text-[0.9rem] leading-snug text-white">
          <div className="mb-2 grid h-[140px] place-items-center rounded-xl bg-gradient-to-br from-[#3a2f1f] to-[#6b4e2e] text-[0.95rem] font-bold text-[#f5e6c8]">
            {messages.alertPhoto}
          </div>
          <strong>SaleSnipe:</strong> {messages.alertMatch}
          <br />
          {messages.alertSale}
          <br />
          {messages.alertDoors}
          <div className="mt-1.5 text-[0.82rem] text-white/85">
            {messages.alertLink}
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="mt-4 block w-full rounded-[14px] bg-gradient-to-br from-ss-accent to-[#f0c27b] py-3.5 text-center text-base font-bold text-[#1a1208]"
      >
        {messages.backSignup}
      </Link>
      <p className="mt-3 text-center text-[0.72rem] text-ss-muted">
        {messages.workingName}
      </p>
    </PhoneShell>
  );
}
