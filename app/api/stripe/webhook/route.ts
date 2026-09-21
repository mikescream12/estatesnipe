import { NextResponse } from "next/server";
import { constructWebhookEvent, forgetCustomerFromEvent } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Verifies Stripe signatures and drops the in-memory Pro cache for that customer.
 * Subscription state is read from Stripe on the next request (no durable DB).
 * Fail closed if STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    const event = constructWebhookEvent(raw, signature);
    const customerId = HANDLED.has(event.type)
      ? forgetCustomerFromEvent(event)
      : null;
    return NextResponse.json({
      received: true,
      type: event.type,
      handled: HANDLED.has(event.type),
      customer: Boolean(customerId),
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : 400;
    const message = err instanceof Error ? err.message : "Webhook rejected";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
