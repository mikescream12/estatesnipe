import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";

export const metadata: Metadata = {
  title: "Privacy Policy — EstateSnipe",
  description:
    "How EstateSnipe collects and uses phone, email, zip, and watch data for SMS estate-sale alerts.",
  alternates: { canonical: "/privacy" },
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
          Terms
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-4 text-xs text-ss-muted">Last updated: September 24, 2026</p>

      <div className="space-y-4 text-sm leading-relaxed text-ss-text">
        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Who we are</h2>
          <p className="text-ss-muted">
            EstateSnipe (&quot;we&quot;, &quot;us&quot;) provides estate-sale match alerts at{" "}
            <a
              href="https://www.estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              www.estatesnipe.com
            </a>
            . Contact:{" "}
            <a
              href="mailto:alerts@estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              alerts@estatesnipe.com
            </a>
            .
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Information we collect</h2>
          <ul className="list-disc space-y-1 pl-4 text-ss-muted">
            <li>
              <strong className="text-ss-text">Phone number</strong> — to send
              SMS match alerts you request.
            </li>
            <li>
              <strong className="text-ss-text">Email address</strong> — for
              email alerts and account notices.
            </li>
            <li>
              <strong className="text-ss-text">ZIP / location radius</strong> —
              to limit alerts to sales near you.
            </li>
            <li>
              <strong className="text-ss-text">Watch keywords &amp; prefs</strong>{" "}
              — what you ask us to look for (items, styles, consent choices).
            </li>
            <li>
              <strong className="text-ss-text">Usage / device basics</strong> —
              such as browser type or app install signals needed to run the
              service.
            </li>
          </ul>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">SMS / text messaging program</h2>
          <p className="mb-2 text-ss-muted">
            If you opt in on our website, we may send transactional SMS alerts
            when EstateSnipe finds estate-sale listings that match your watches.
          </p>
          <ul className="list-disc space-y-1 pl-4 text-ss-muted">
            <li>
              <strong className="text-ss-text">Opt-in:</strong> You visit{" "}
              <a
                href="https://www.estatesnipe.com"
                className="text-ss-accent2 underline"
              >
                https://www.estatesnipe.com
              </a>{" "}
              (Alerts sheet on the home chat, or{" "}
              <a
                href="https://www.estatesnipe.com/app/sample-alert"
                className="text-ss-accent2 underline"
              >
                /app/sample-alert
              </a>
              ), enter your mobile number, and check an unchecked-by-default
              consent box agreeing to receive recurring estate-sale match SMS
              from EstateSnipe.
            </li>
            <li>
              <strong className="text-ss-text">Frequency:</strong> Message
              frequency varies. You may receive up to several alerts per day
              when matching estate sales are found, or none when there are no
              matches.
            </li>
            <li>
              <strong className="text-ss-text">Rates:</strong> Msg &amp; data
              rates may apply.
            </li>
            <li>
              <strong className="text-ss-text">HELP:</strong> Reply HELP for
              help.
            </li>
            <li>
              <strong className="text-ss-text">STOP:</strong> Reply STOP to opt
              out of texts at any time. You may also update preferences on the
              website.
            </li>
          </ul>
        </section>

        <section className="rounded-[18px] border border-ss-accent bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">
            Mobile information — no sale for spam
          </h2>
          <p className="text-ss-muted">
            We do not share, sell, or provide your mobile phone number or
            messaging consent data to third parties or affiliates for marketing
            or promotional purposes. We do not sell your personal information
            for spam or lead-generation lists.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">How we use data</h2>
          <ul className="list-disc space-y-1 pl-4 text-ss-muted">
            <li>Deliver the SMS and email alerts you requested.</li>
            <li>Match your watches against public estate-sale listings.</li>
            <li>Operate, secure, and improve EstateSnipe.</li>
            <li>
              Send occasional product notices only if you separately consent to
              marketing texts.
            </li>
          </ul>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Service providers</h2>
          <p className="text-ss-muted">
            We use processors that help us run the service (for example SMS
            delivery, hosting, and email). They may process data only to
            provide those services to us, not to market to you on their own
            behalf with your messaging consent.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Retention &amp; your choices</h2>
          <p className="text-ss-muted">
            We keep contact and watch data while your alerts are active and as
            needed to operate the service or meet legal obligations. You can
            reply STOP to end SMS, email us to request deletion of stored
            contact prefs, or clear local profile data in your browser.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Contact</h2>
          <p className="text-ss-muted">
            Questions about privacy or SMS:{" "}
            <a
              href="mailto:alerts@estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              alerts@estatesnipe.com
            </a>
            . See also our{" "}
            <Link href="/terms" className="text-ss-accent2 underline">
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </PhoneShell>
  );
}
