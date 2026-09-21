import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";

export const metadata: Metadata = {
  title: "Privacy Policy — EstateSnipe",
  description:
    "How EstateSnipe collects and uses phone numbers, email, and watch preferences for SMS alerts.",
};

export default function PrivacyPage() {
  return (
    <PhoneShell>
      <BrandHeader />
      <p className="mb-3 text-xs text-ss-muted">
        <Link href="/" className="text-ss-accent2">
          Home
        </Link>
        {" · "}
        <Link href="/terms" className="text-ss-accent2">
          Terms of Service
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-4 text-[0.85rem] text-ss-muted">
        Last updated: September 21, 2026
      </p>

      <div className="space-y-4 text-[0.9rem] leading-relaxed text-ss-text">
        <section>
          <h2 className="mb-1 text-base font-bold">Overview</h2>
          <p className="text-ss-muted">
            EstateSnipe (&quot;we&quot;) provides estate-sale match alerts by SMS
            and email. This policy explains what we collect and how we use it
            for those alerts.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Information we collect</h2>
          <ul className="list-disc space-y-1 pl-4 text-ss-muted">
            <li>Phone number (for SMS match alerts, if you opt in)</li>
            <li>Email address (for email alerts, if provided)</li>
            <li>
              Watch preferences (keywords, zip, radius, and related filters you
              set)
            </li>
            <li>Consent choices for alerts and optional marketing messages</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">How we use it</h2>
          <p className="text-ss-muted">
            We use your contact details and watches only to send match alerts
            you requested and, if you separately opt in, occasional EstateSnipe
            offers. Message frequency depends on how often matching estate-sale
            items are found near you.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">SMS</h2>
          <p className="text-ss-muted">
            SMS alerts are sent only after you affirmatively check the consent
            box. Message and data rates may apply. Reply STOP to opt out of SMS
            anytime. Reply HELP for help. We do not sell or share your phone
            number with third parties for their marketing.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Sharing</h2>
          <p className="text-ss-muted">
            We may use service providers (for example Twilio for SMS delivery)
            solely to operate EstateSnipe. We do not sell your personal
            information or phone numbers.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">Contact</h2>
          <p className="text-ss-muted">
            Questions about privacy or SMS:{" "}
            <a
              href="mailto:support@estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              support@estatesnipe.com
            </a>{" "}
            or visit{" "}
            <a
              href="https://www.estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              estatesnipe.com
            </a>
            .
          </p>
        </section>
      </div>
    </PhoneShell>
  );
}
