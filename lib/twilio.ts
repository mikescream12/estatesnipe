import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN. Set them in .env.local."
    );
  }

  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

/**
 * Messaging Service SID (MG…) when configured. Rejects placeholders / missing prefix.
 */
export function getTwilioMessagingServiceSid(): string | null {
  const sid = (process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  if (!sid || sid.includes("[SENSITIVE]") || !sid.startsWith("MG")) {
    return null;
  }
  return sid;
}

/**
 * Prefer Messaging Service when set; otherwise require E.164 TWILIO_PHONE_NUMBER.
 * Returns the phone fallback string (callers should prefer twilioSenderParams()).
 */
export function getTwilioFromNumber(): string {
  const msid = getTwilioMessagingServiceSid();
  if (msid) {
    // Prefer Messaging Service; phone still useful for logging / fallback checks.
    const from = (process.env.TWILIO_PHONE_NUMBER || "").trim();
    if (from && isE164(from) && !from.includes("[SENSITIVE]")) {
      return from;
    }
    // Messaging Service is enough for sending via twilioSenderParams().
    return msid;
  }

  const from = (process.env.TWILIO_PHONE_NUMBER || "").trim();
  if (!from || from.includes("[SENSITIVE]")) {
    throw new Error("Missing TWILIO_PHONE_NUMBER. Set it in .env.local.");
  }
  if (!isE164(from)) {
    throw new Error(
      "TWILIO_PHONE_NUMBER must be E.164 (e.g. +16575665925)."
    );
  }
  return from;
}

/** Params for client.messages.create — Messaging Service preferred over From. */
export function twilioSenderParams():
  | { messagingServiceSid: string }
  | { from: string } {
  const msid = getTwilioMessagingServiceSid();
  if (msid) {
    return { messagingServiceSid: msid };
  }
  return { from: getTwilioFromNumber() };
}

/** E.164: + followed by 8–15 digits */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/** Twilio trial Body must be one of these template names (not free text). */
export const TRIAL_SMS_TEMPLATE = "sms_event_notifications";

/** Used after Twilio upgrade when custom bodies are allowed. */
export const DEFAULT_SAMPLE_SMS =
  "EstateSnipe: Looks like hen-on-a-nest (87% match). Lakewood Estate Sale · 8.2 mi. Doors Sat 9:00am. More at https://estatesnipe.com";
