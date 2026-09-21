import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";

export const metadata: Metadata = {
  title: "Terms of Service — EstateSnipe",
  description:
    "Terms for using EstateSnipe estate-sale alerts, including SMS program terms.",
};

export default function TermsPage() {
  return (
    <PhoneShell>
      <BrandHeader />
      <p className="mb-3 text-xs text-ss-muted">
        <Link href="/" className="text-ss-accent2">
          Home
        </Link>
        {" · "}
        <Link href="/privacy" className="text-ss-accent2">
          Privacy Policy
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        Terms of Service
      </h1>
      <p className="mb-4 text-[0.85rem] text-ss-muted">
        Last updated: September 21, 2026
      </p>

      <div className="space-y-4 text-[0.9rem] leading-relaxed text-ss-text">
        <section>
          <h2 className="mb-1 text-base font-bold">Service</h2>
          <p className="text-ss-muted">
            EstateSnipe helps you set watches for estate-sale items and receive
            alerts when matches appear near your location. Listings come from
            third-party sources; availability and accuracy are not guaranteed.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">SMS program</h2>
          <p className="text-ss-muted">
            By checking the SMS consent box and providing your mobile number,
            you agree to receive EstateSnipe match-alert texts when items
            matching your watches are found. Consent is not a condition of
            purchase. Message frequency varies with match activity. Message and
            data rates may apply. Reply STOP to cancel. Reply HELP for help.
            Carriers are not liable for delayed or undelivered messages.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Optional marketing</h2>
          <p className="text-ss-muted">
            If you separately opt in to marketing, you may receive occasional
            offers from EstateSnipe. You can reply STOP to end SMS, including
            marketing texts.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Acceptable use</h2>
          <p className="text-ss-muted">
            Use EstateSnipe lawfully and only with a phone number you control.
            Do not abuse the service or attempt to interfere with scans or
            messaging.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Contact</h2>
          <p className="text-ss-muted">
            Support:{" "}
            <a
              href="mailto:support@estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              support@estatesnipe.com
            </a>
          </p>
        </section>
      </div>
    </PhoneShell>
  );
}
