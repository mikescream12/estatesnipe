import { NextResponse } from "next/server";
import {
  DEFAULT_SAMPLE_SMS,
  TRIAL_SMS_TEMPLATE,
  getTwilioClient,
  getTwilioFromNumber,
  isE164,
} from "@/lib/twilio";

export const runtime = "nodejs";

type Body = {
  to?: string;
  body?: string;
};

export async function POST(request: Request) {
  let json: Body;
  try {
    json = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body. Expected { to, body? }." },
      { status: 400 }
    );
  }

  const to = typeof json.to === "string" ? json.to.trim() : "";
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "Missing 'to' phone number." },
      { status: 400 }
    );
  }
  if (!isE164(to)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid 'to' number. Use E.164 format, e.g. +12145550199 (leading +, country code, digits only).",
      },
      { status: 400 }
    );
  }

  // Trial accounts require a Twilio template name in Body (not free text).
  // After upgrade, pass a custom body string via { body: "..." }.
  const requested =
    typeof json.body === "string" && json.body.trim()
      ? json.body.trim()
      : "";
  const trialTemplates = new Set([
    "sms_2fa",
    "sms_appointment_reminders",
    "sms_order_confirmation",
    "sms_delivery_updates",
    "sms_customer_support",
    "sms_marketing_promotions",
    "sms_event_notifications",
    "sms_account_alerts",
    "sms_feedback_surveys",
    "sms_internal_alerts",
  ]);
  const useCustom = requested.length > 0 && !trialTemplates.has(requested) && !requested.startsWith("sms_");
  const body = requested
    ? requested
    : TRIAL_SMS_TEMPLATE;

  try {
    const client = getTwilioClient();
    const from = getTwilioFromNumber();
    // If caller sent free text, still try it (works post-upgrade); on trial prefer template.
    const payloadBody = useCustom ? requested : (trialTemplates.has(body) || body.startsWith("sms_") ? body : TRIAL_SMS_TEMPLATE);
    const message = await client.messages.create({ to, from, body: payloadBody });
    return NextResponse.json({ ok: true, sid: message.sid });
  } catch (err: unknown) {
    const twilioErr = err as {
      message?: string;
      code?: number | string;
      status?: number;
      moreInfo?: string;
    };
    const message =
      twilioErr.message ||
      (err instanceof Error ? err.message : "Failed to send SMS");
    // Trial accounts often reject unverified destination numbers — surface clearly
    const hint =
      typeof twilioErr.code !== "undefined" &&
      String(twilioErr.code) === "21608"
        ? " (Twilio trial: verify this number in the Twilio Console first.)"
        : /unverified|trial/i.test(message)
          ? " (Twilio trial accounts can only SMS verified numbers.)"
          : "";

    return NextResponse.json(
      {
        ok: false,
        error: `${message}${hint}`,
        code: twilioErr.code ?? undefined,
      },
      { status: 502 }
    );
  }
}
