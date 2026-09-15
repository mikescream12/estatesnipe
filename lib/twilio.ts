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

export function getTwilioFromNumber(): string {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error("Missing TWILIO_PHONE_NUMBER. Set it in .env.local.");
  }
  return from;
}

/** E.164: + followed by 8–15 digits */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export const DEFAULT_SAMPLE_SMS =
  "EstateSnipe: Looks like hen-on-a-nest (87% match). Lakewood Estate Sale · 8.2 mi. Doors Sat 9:00am. More at https://estatesnipe.com";
