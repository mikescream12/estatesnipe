import { NextResponse } from "next/server";
import {
  BILLING_COOKIE,
  billingCookieOptions,
  entitlementFromCheckoutSession,
  signBillingCookie,
} from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe success_url lands here. Sets the signed customer cookie only if Pro is active. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") || "";
  const result = await entitlementFromCheckoutSession(sessionId);
  if (!result.ok || !result.pro) {
    const dest = new URL("/pricing", url.origin);
    dest.searchParams.set("checkout", result.ok ? "not_pro" : "incomplete");
    return NextResponse.redirect(dest);
  }
  const dest = new URL("/subscribe", url.origin);
  dest.searchParams.set("status", "pro");
  const res = NextResponse.redirect(dest);
  res.cookies.set(
    BILLING_COOKIE,
    signBillingCookie(result.customerId),
    billingCookieOptions()
  );
  return res;
}
