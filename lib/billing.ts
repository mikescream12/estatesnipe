import { createHmac, timingSafeEqual } from "crypto";
import Stripe from "stripe";
import {
  FREE_RADIUS_MI,
  PRO_MAX_RADIUS_MI,
  PRO_PRICE_CENTS,
  PRO_PRICE_CURRENCY,
  PRO_PRICE_INTERVAL,
  PRO_PRICE_LABEL,
  PRO_PRICE_SOURCE,
  PRO_PRODUCT_NAME,
} from "./plans";

export const BILLING_COOKIE = "es_billing";
/** 90 days. Entitlement is re-checked against Stripe, not trusted from the cookie alone. */
export const BILLING_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

const PRO_CACHE_MS = 60_000;
const proCache = new Map<string, { pro: boolean; at: number }>();

let stripeClient: Stripe | null = null;
let stripeClientKey = "";

export function stripeSecret(): string {
  return (process.env.STRIPE_SECRET_KEY || "").trim();
}

export function webhookSecret(): string {
  return (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

/** Reject empty, redacted placeholders, and non-Stripe shapes so checkout fails closed. */
function isUsableSecret(value: string, kind: "stripe" | "webhook"): boolean {
  const v = value.trim();
  if (!v) return false;
  if (
    /^\[SENSITIVE\]$/i.test(v) ||
    /^SENSITIVE$/i.test(v) ||
    /^changeme$/i.test(v) ||
    /^your[_-]?/i.test(v) ||
    /^<.*>$/.test(v) ||
    /^xxx+$/i.test(v)
  ) {
    return false;
  }
  if (kind === "stripe") {
    return /^sk_(live|test)_[A-Za-z0-9]+$/.test(v) && v.length >= 20;
  }
  return /^whsec_[A-Za-z0-9]+$/.test(v) && v.length >= 16;
}

export function stripeSecretConfigured(): boolean {
  return isUsableSecret(stripeSecret(), "stripe");
}

export function webhookSecretConfigured(): boolean {
  return isUsableSecret(webhookSecret(), "webhook");
}

export function isPaywallEnforced(): boolean {
  // No key means nobody can become Pro. Enforcing would turn off live photo matching.
  return stripeSecretConfigured();
}

export function missingStripeSecrets(): string[] {
  const missing: string[] = [];
  if (!stripeSecretConfigured()) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecretConfigured()) missing.push("STRIPE_WEBHOOK_SECRET");
  return missing;
}

export function getStripe(): Stripe | null {
  const key = stripeSecret();
  if (!stripeSecretConfigured()) return null;
  if (!stripeClient || stripeClientKey !== key) {
    stripeClient = new Stripe(key);
    stripeClientKey = key;
  }
  return stripeClient;
}

export function billingCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: BILLING_COOKIE_MAX_AGE,
  };
}

export function billingPublicStatus() {
  const missing = missingStripeSecrets();
  const configured = stripeSecretConfigured();
  const priceId = (process.env.STRIPE_PRICE_ID || "").trim();
  return {
    configured,
    checkoutReady: configured,
    webhookReady: configured && webhookSecretConfigured(),
    /**
     * This process does not create Stripe Dashboard endpoints.
     * Callers that have a key can still ask stripeWebhookRegistered().
     */
    price: {
      cents: PRO_PRICE_CENTS,
      currency: PRO_PRICE_CURRENCY,
      interval: PRO_PRICE_INTERVAL,
      label: PRO_PRICE_LABEL,
      source: priceId ? "STRIPE_PRICE_ID" : PRO_PRICE_SOURCE,
      priceIdConfigured: Boolean(priceId),
    },
    missing,
    paywallEnforced: configured,
    gated: {
      vision: configured,
      radius: configured,
      freeRadiusMiles: FREE_RADIUS_MI,
      proMaxRadiusMiles: PRO_MAX_RADIUS_MI,
      note: configured
        ? "Free keeps a 25 mile radius and title/keyword matches. An active Pro subscription unlocks photo matches and a radius up to 100 miles."
        : "Paywall is not enforced because STRIPE_SECRET_KEY is missing. Photo matching stays on via ESTATESNIPE_VISION_ENABLED so the live photo feature does not go dark. Intended gate once Stripe is configured: free keeps 25 miles and keyword matches; Pro gets photo-match results and the larger radius.",
    },
  };
}

function lineItems(): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const priceId = (process.env.STRIPE_PRICE_ID || "").trim();
  if (priceId) {
    return [{ price: priceId, quantity: 1 }];
  }
  return [
    {
      quantity: 1,
      price_data: {
        currency: PRO_PRICE_CURRENCY,
        unit_amount: PRO_PRICE_CENTS,
        recurring: { interval: PRO_PRICE_INTERVAL },
        product_data: {
          name: PRO_PRODUCT_NAME,
          description:
            "Photo matching plus search radius up to 100 miles. Free stays at 25 miles and keyword matches.",
        },
      },
    },
  ];
}

export async function createProCheckoutSession(origin: string): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: lineItems(),
    success_url: `${origin}/api/stripe/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
    metadata: { product: "estatesnipe_pro" },
    subscription_data: {
      metadata: { product: "estatesnipe_pro" },
    },
  });
  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL");
  }
  return session.url;
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id || null;
}

export async function customerIsPro(customerId: string): Promise<boolean> {
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return false;
  const cached = proCache.get(customerId);
  if (cached && Date.now() - cached.at < PRO_CACHE_MS) return cached.pro;
  const stripe = getStripe();
  if (!stripe) return false;
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  const pro = subs.data.some(
    (s) => s.status === "active" || s.status === "trialing"
  );
  proCache.set(customerId, { pro, at: Date.now() });
  return pro;
}

export function forgetCachedCustomer(customerId: string | null): void {
  if (customerId) proCache.delete(customerId);
}

export async function entitlementFromCheckoutSession(sessionId: string): Promise<
  | { ok: true; customerId: string; pro: boolean }
  | { ok: false; error: string }
> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "STRIPE_SECRET_KEY missing" };
  if (!sessionId.startsWith("cs_")) {
    return { ok: false, error: "Invalid session_id" };
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.mode !== "subscription" || session.status !== "complete") {
    return { ok: false, error: "Checkout is not a completed subscription" };
  }
  const customerId = customerIdOf(session.customer);
  if (!customerId) return { ok: false, error: "Checkout has no customer" };
  const pro = await customerIsPro(customerId);
  return { ok: true, customerId, pro };
}

export function signBillingCookie(customerId: string): string {
  const key = stripeSecret();
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) {
    throw new Error("Invalid customer id");
  }
  const exp = Math.floor(Date.now() / 1000) + BILLING_COOKIE_MAX_AGE;
  const payload = `v1.${customerId}.${exp}`;
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function customerIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const key = stripeSecret();
  if (!key) return null;
  const pair = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${BILLING_COOKIE}=`));
  if (!pair) return null;
  let raw = pair.slice(BILLING_COOKIE.length + 1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const bits = raw.split(".");
  if (bits.length !== 4 || bits[0] !== "v1") return null;
  const customerId = bits[1];
  const exp = Number(bits[2]);
  const sig = bits[3];
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return null;
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const payload = `v1.${customerId}.${bits[2]}`;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return customerId;
}

export async function resolveScanBilling(
  cookieHeader: string | null
): Promise<{ enforced: boolean; pro: boolean }> {
  if (!isPaywallEnforced()) return { enforced: false, pro: false };
  const customerId = customerIdFromCookie(cookieHeader);
  if (!customerId) return { enforced: true, pro: false };
  try {
    const pro = await customerIsPro(customerId);
    return { enforced: true, pro };
  } catch {
    return { enforced: true, pro: false };
  }
}

export function constructWebhookEvent(
  rawBody: string,
  signature: string | null
): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error("STRIPE_SECRET_KEY missing");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  const secret = webhookSecret();
  if (!webhookSecretConfigured()) {
    const err = new Error("STRIPE_WEBHOOK_SECRET missing");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  if (!signature) {
    const err = new Error("Missing Stripe-Signature header");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    const err = new Error("Invalid Stripe webhook signature");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export function forgetCustomerFromEvent(event: Stripe.Event): string | null {
  let customer: string | Stripe.Customer | Stripe.DeletedCustomer | null = null;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    customer = event.data.object.customer;
  }
  const customerId = customerIdOf(customer);
  forgetCachedCustomer(customerId);
  return customerId;
}

export async function stripeWebhookRegistered(origin: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    const want = `${origin}/api/stripe/webhook`;
    return list.data.some((e) => e.url === want && e.status !== "disabled");
  } catch {
    return false;
  }
}

export function safeStripeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Stripe request failed";
  return msg
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "sk_[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
    .replace(/rk_(live|test)_[A-Za-z0-9]+/g, "rk_[redacted]");
}
