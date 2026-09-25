/** E.164: + followed by 8–15 digits */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Accept casual US phone input and normalize to E.164 (+1XXXXXXXXXX).
 * Accepts: 7143459641, 714-345-9641, (714) 345-9641, 17143459641, +17143459641.
 * Returns "" when the input is not a plausible phone number.
 */
export function normalizePhone(input: string | undefined | null): string {
  if (input == null) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  if (isE164(raw)) return raw;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    const e164 = `+1${digits}`;
    return isE164(e164) ? e164 : "";
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const e164 = `+${digits}`;
    return isE164(e164) ? e164 : "";
  }

  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    const e164 = `+${digits}`;
    return isE164(e164) ? e164 : "";
  }

  return "";
}
