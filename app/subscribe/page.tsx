import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { BrandHeader } from "@/components/BrandHeader";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PhoneShell } from "@/components/PhoneShell";
import {
  BILLING_COOKIE,
  billingPublicStatus,
  customerIdFromCookie,
  customerIsPro,
} from "@/lib/billing";
import { PRO_PRICE_LABEL } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscribe — EstateSnipe Pro",
  description: "Start EstateSnipe Pro checkout.",
};

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = billingPublicStatus();
  let pro = false;
  if (status.configured) {
    const jar = await cookies();
    const raw = jar.get(BILLING_COOKIE)?.value;
    const header = raw ? `${BILLING_COOKIE}=${raw}` : null;
    const customerId = customerIdFromCookie(header);
    if (customerId) {
      try {
        pro = await customerIsPro(customerId);
      } catch {
        pro = false;
      }
    }
  }

  const justReturned = params.status === "pro";

  return (
    <PhoneShell>
      <BrandHeader />
      <p className="mb-3 text-xs text-ss-muted">
        <Link href="/pricing" className="text-ss-accent2">
          Pricing
        </Link>
        {" · "}
        <Link href="/app" className="text-ss-accent2">
          Watches
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        EstateSnipe Pro
      </h1>
      <p className="mb-4 text-[0.95rem] text-ss-muted">
        {PRO_PRICE_LABEL} · photo matching and up to 100 miles.
      </p>

      <div className="mb-4 rounded-[18px] border border-ss-line bg-ss-card p-4">
        <p className="text-sm font-semibold">
          {pro
            ? "Pro is active on this browser."
            : status.checkoutReady
              ? "You are on Free until Checkout finishes."
              : "Pro checkout is not live."}
        </p>
        {justReturned && pro ? (
          <p className="mt-2 text-sm text-ss-accent2">Subscription confirmed.</p>
        ) : null}
        {!status.checkoutReady ? (
          <p className="mt-2 text-sm text-ss-muted">
            The Checkout route is deployed and fails closed until the server
            Stripe secret is set. Photo matching is still on for everyone so the
            live photo feature stays up.
          </p>
        ) : null}
        <div className="mt-4">
          <CheckoutButton
            label={pro ? "Open Checkout again" : "Continue to Stripe"}
            disabledReason={
              status.checkoutReady
                ? null
                : "No session URL yet. The server Stripe key is not configured."
            }
          />
        </div>
      </div>
    </PhoneShell>
  );
}
