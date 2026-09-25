import { normalizePhone } from "./phone";
import { FREE_RADIUS_MI, PRO_MAX_RADIUS_MI } from "./plans";

/** Built-in founder / test phones (E.164). Never unlock the world — allowlist only. */
const DEFAULT_FOUNDER_PHONES = ["+17143459641"];

function parsePhoneList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((p) => normalizePhone(p))
    .filter(Boolean);
}

/**
 * Allowlist of phones that get Pro without Stripe.
 * Server merges FOUNDER_PHONES / TEST_PRO_PHONES env (comma-separated E.164).
 * Client uses the baked-in default (and optional NEXT_PUBLIC_* mirrors).
 */
export function founderPhoneAllowlist(): string[] {
  const fromEnv = [
    ...parsePhoneList(
      typeof process !== "undefined"
        ? process.env.FOUNDER_PHONES || process.env.TEST_PRO_PHONES
        : undefined
    ),
    ...parsePhoneList(
      typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_FOUNDER_PHONES ||
            process.env.NEXT_PUBLIC_TEST_PRO_PHONES
        : undefined
    ),
  ];
  const set = new Set<string>([...DEFAULT_FOUNDER_PHONES, ...fromEnv]);
  return [...set];
}

/** True when the given phone (any casual US form) is on the founder allowlist. */
export function isFounderPhone(phone: string | undefined | null): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  return founderPhoneAllowlist().includes(normalized);
}

/** Max radius the UI should offer for this profile. */
export function maxRadiusForPhone(phone: string | undefined | null): number {
  return isFounderPhone(phone) ? PRO_MAX_RADIUS_MI : FREE_RADIUS_MI;
}
