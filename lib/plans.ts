/**
 * EstateSnipe plan constants.
 *
 * No Pro price was stored in the repo. $9/month is the price chosen for
 * Checkout (not a previously stated user price). Set STRIPE_PRICE_ID to
 * use a Dashboard price instead of inline price_data.
 */

export const FREE_RADIUS_MI = 25;
export const PRO_MAX_RADIUS_MI = 100;
export const PRO_PRICE_CENTS = 900;
export const PRO_PRICE_CURRENCY = "usd";
export const PRO_PRICE_INTERVAL = "month" as const;
export const PRO_PRICE_LABEL = "$9/month";
/** No price id or dollar amount existed in the repo. */
export const PRO_PRICE_SOURCE = "chosen_default" as const;
export const PRO_PRODUCT_NAME = "EstateSnipe Pro";

export type PlanTier = "free" | "pro" | "ungated";

export type ScanBillingInput = {
  enforced: boolean;
  pro: boolean;
};

/**
 * Free: 25 miles. Photo matching stays on for everyone, paid or not.
 * Pro: requested radius (already clamped to 100). Radius is the Pro difference.
 * Ungated (Stripe secret missing): do not shrink the live photo feature.
 */
export function gateScanAccess(
  requestedRadius: number,
  billing: ScanBillingInput | undefined,
  paywallDefault: boolean
): {
  enforced: boolean;
  pro: boolean;
  radiusMiles: number;
  radiusCapped: boolean;
  allowVision: boolean;
  tier: PlanTier;
} {
  const enforced = billing ? billing.enforced : paywallDefault;
  const pro = Boolean(billing?.pro) && enforced;
  const radiusMiles =
    enforced && !pro ? Math.min(requestedRadius, FREE_RADIUS_MI) : requestedRadius;
  return {
    enforced,
    pro,
    radiusMiles,
    radiusCapped: radiusMiles < requestedRadius,
    allowVision: true,
    tier: !enforced ? "ungated" : pro ? "pro" : "free",
  };
}

/**
 * Interactive hunt searches use the miles the user just asked for (already
 * clamped to 1–100). Cron and other unattended scans keep the free-plan cap.
 * `honoredPastFreeCap` is true when a free account would have been clamped
 * and we searched the wider radius anyway.
 */
export function resolveScanRadius(
  requestedRadius: number,
  billing: ScanBillingInput | undefined,
  paywallDefault: boolean,
  honorRadius: boolean
): {
  enforced: boolean;
  pro: boolean;
  radiusMiles: number;
  radiusCapped: boolean;
  allowVision: boolean;
  tier: PlanTier;
  honoredPastFreeCap: boolean;
} {
  const access = gateScanAccess(requestedRadius, billing, paywallDefault);
  if (!honorRadius) {
    return { ...access, honoredPastFreeCap: false };
  }
  return {
    ...access,
    radiusMiles: requestedRadius,
    radiusCapped: false,
    honoredPastFreeCap: access.radiusCapped,
  };
}
