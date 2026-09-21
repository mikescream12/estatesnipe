import { NextResponse } from "next/server";
import {
  billingPublicStatus,
  createProCheckoutSession,
  safeStripeError,
  stripeSecretConfigured,
  stripeWebhookRegistered,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsJson(request: Request): boolean {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return true;
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  const status = billingPublicStatus();
  const origin = new URL(request.url).origin;
  const webhookRegistered = status.configured
    ? await stripeWebhookRegistered(origin)
    : false;
  return NextResponse.json({
    ok: status.checkoutReady,
    ...status,
    webhookRegistered,
    webhookNote: webhookRegistered
      ? "A Stripe webhook endpoint points at /api/stripe/webhook."
      : "Webhook endpoint is not registered on Stripe. Dashboard login was not used. Checkout confirmation still verifies the session on return when the secret key is set.",
  });
}

export async function POST(request: Request) {
  const json = wantsJson(request);
  const origin = new URL(request.url).origin;

  if (!stripeSecretConfigured()) {
    const body = {
      ok: false,
      checkout: false,
      url: null,
      error:
        "Stripe checkout is not configured. Missing STRIPE_SECRET_KEY. Refusing to invent a key.",
      missing: ["STRIPE_SECRET_KEY"],
    };
    if (!json) {
      return NextResponse.redirect(
        new URL("/pricing?checkout=unconfigured", origin),
        303
      );
    }
    return NextResponse.json(body, { status: 503 });
  }

  try {
    const url = await createProCheckoutSession(origin);
    if (!json) {
      return NextResponse.redirect(url, 303);
    }
    return NextResponse.json({
      ok: true,
      checkout: true,
      url,
    });
  } catch (err) {
    const message = safeStripeError(err);
    if (!json) {
      return NextResponse.redirect(
        new URL("/pricing?checkout=error", origin),
        303
      );
    }
    return NextResponse.json(
      { ok: false, checkout: false, url: null, error: message },
      { status: 502 }
    );
  }
}
