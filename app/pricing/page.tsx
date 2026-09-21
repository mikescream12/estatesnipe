import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PhoneShell } from "@/components/PhoneShell";
import { billingPublicStatus } from "@/lib/billing";
import { PRO_PRICE_LABEL } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — EstateSnipe",
  description:
    "Free keyword watches or EstateSnipe Pro for photo matching and a wider radius.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  const status = billingPublicStatus();
  const checkout = params.checkout;
  const banner =
    checkout === "cancel"
      ? "Checkout canceled. You are still on Free."
      : checkout === "unconfigured" || checkout === "error"
        ? "Checkout could not start. Pro is not live until Stripe is configured on the server."
        : checkout === "incomplete" || checkout === "not_pro"
          ? "Stripe did not confirm an active Pro subscription."
          : null;

  return (
    <PhoneShell>
      <BrandHeader />
      <p className="mb-3 text-xs text-ss-muted">
        <Link href="/" className="text-ss-accent2">
          Home
        </Link>
        {" · "}
        <Link href="/subscribe" className="text-ss-accent2">
          Subscribe
        </Link>
      </p>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        Free vs Pro
      </h1>
      <p className="mb-4 text-[0.95rem] text-ss-muted">
        Pro is {PRO_PRICE_LABEL}. That amount was chosen here because the repo
        did not already set a Pro price.
      </p>

      {banner ? (
        <p className="mb-3 rounded-[14px] border border-ss-line bg-ss-card px-3 py-2 text-sm text-ss-muted">
          {banner}
        </p>
      ) : null}

      <div className="mb-3 rounded-[18px] border border-ss-line bg-ss-card p-4">
        <h2 className="text-base font-bold">Free</h2>
        <p className="mt-1 text-sm text-ss-muted">$0</p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-ss-text">
          <li>Title and keyword matches</li>
          <li>25 mile search radius</li>
        </ul>
      </div>

      <div className="mb-4 rounded-[18px] border border-ss-accent bg-ss-card p-4">
        <h2 className="text-base font-bold">Pro</h2>
        <p className="mt-1 text-sm text-ss-accent">{PRO_PRICE_LABEL}</p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-ss-text">
          <li>Photo match badge and photo results</li>
          <li>Search radius up to 100 miles</li>
          <li>Everything in Free</li>
        </ul>
        <div className="mt-4">
          <CheckoutButton
            disabledReason={
              status.checkoutReady
                ? null
                : "Checkout is not live yet. The server has no Stripe secret key, so this cannot open a Stripe session."
            }
          />
        </div>
      </div>

      <p className="text-[0.72rem] leading-relaxed text-ss-muted">
        {status.checkoutReady
          ? "Free stays at 25 miles and keyword matches. Pro (active or trialing) unlocks photo matches and up to 100 miles."
          : "Photo matching is still on for everyone until Stripe can sell Pro. After that, free stays at 25 miles and keyword matches, and Pro unlocks photo matches plus up to 100 miles."}
      </p>
    </PhoneShell>
  );
}
