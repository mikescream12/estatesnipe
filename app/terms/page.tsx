import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { PhoneShell } from "@/components/PhoneShell";

export const metadata: Metadata = {
  title: "Terms of Service — EstateSnipe",
  description:
    "Terms for using EstateSnipe and the SMS estate-sale match alert program.",
  alternates: { canonical: "/terms" },
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
          Privacy
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        Terms of Service
      </h1>
      <p className="mb-4 text-xs text-ss-muted">Last updated: September 24, 2026</p>

      <div className="space-y-4 text-sm leading-relaxed text-ss-text">
        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Agreement</h2>
          <p className="text-ss-muted">
            By using EstateSnipe at{" "}
            <a
              href="https://www.estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              www.estatesnipe.com
            </a>
            , you agree to these Terms and our{" "}
            <Link href="/privacy" className="text-ss-accent2 underline">
              Privacy Policy
            </Link>
            . If you do not agree, do not use the service.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">The service</h2>
          <p className="text-ss-muted">
            EstateSnipe helps you set watches for estate-sale items and can
            notify you by SMS and/or email when matching listings appear near
            your ZIP. Listings come from third-party public sources; we do not
            run the sales and availability can change without notice. Alerts
            are informational only — not a guarantee you will get an item.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-accent bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">SMS program terms (TCPA)</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-ss-muted">
            <li>
              <strong className="text-ss-text">Consent:</strong> By visiting{" "}
              <a
                href="https://www.estatesnipe.com"
                className="text-ss-accent2 underline"
              >
                https://www.estatesnipe.com
              </a>{" "}
              or{" "}
              <a
                href="https://www.estatesnipe.com/app/sample-alert"
                className="text-ss-accent2 underline"
              >
                https://www.estatesnipe.com/app/sample-alert
              </a>
              , entering your mobile number, and checking an
              unchecked-by-default consent box, you expressly consent to
              receive recurring automated text messages from EstateSnipe about
              estate-sale matches related to your watches. Consent is not a
              condition of purchase.
            </li>
            <li>
              <strong className="text-ss-text">Frequency:</strong> Message
              frequency varies with matching sales — up to several alerts per
              day when matches are found, or none when there are no matches.
            </li>
            <li>
              <strong className="text-ss-text">Rates:</strong> Msg &amp; data
              rates may apply.
            </li>
            <li>
              <strong className="text-ss-text">STOP:</strong> Reply STOP to
              cancel SMS at any time. After you opt out you will receive a
              confirmation and no further program texts unless you opt in
              again.
            </li>
            <li>
              <strong className="text-ss-text">HELP:</strong> Reply HELP for
              help, or email{" "}
              <a
                href="mailto:alerts@estatesnipe.com"
                className="text-ss-accent2 underline"
              >
                alerts@estatesnipe.com
              </a>
              .
            </li>
            <li>
              Supported carriers may vary; delivery is not guaranteed on all
              networks.
            </li>
          </ul>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Your responsibilities</h2>
          <ul className="list-disc space-y-1 pl-4 text-ss-muted">
            <li>Provide accurate contact info you are authorized to use.</li>
            <li>Use the service lawfully and for personal alert purposes.</li>
            <li>
              Do not abuse scanners, APIs, or third-party sale sites through
              our product.
            </li>
          </ul>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">No sale of SMS consent</h2>
          <p className="text-ss-muted">
            We do not sell your phone number or SMS opt-in for spam or
            third-party marketing lists. Mobile information and messaging
            consent are not shared with third parties or affiliates for
            marketing or promotional purposes. See the Privacy Policy for
            details.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Disclaimers</h2>
          <p className="text-ss-muted">
            The service is provided &quot;as is&quot; without warranties of any
            kind. We are not liable for missed sales, incorrect listings,
            carrier delays, or decisions you make based on alerts. To the
            fullest extent allowed by law, our total liability for claims
            relating to the service is limited to the amount you paid us in the
            three months before the claim (or $0 if you use only the free
            tier).
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Changes</h2>
          <p className="text-ss-muted">
            We may update these Terms. Continued use after changes means you
            accept the updated Terms. Material SMS-program changes will be
            reflected on this page and/or our Privacy Policy.
          </p>
        </section>

        <section className="rounded-[18px] border border-ss-line bg-ss-card p-4">
          <h2 className="mb-2 text-base font-bold">Contact</h2>
          <p className="text-ss-muted">
            EstateSnipe —{" "}
            <a
              href="mailto:alerts@estatesnipe.com"
              className="text-ss-accent2 underline"
            >
              alerts@estatesnipe.com
            </a>
          </p>
        </section>
      </div>
    </PhoneShell>
  );
}
