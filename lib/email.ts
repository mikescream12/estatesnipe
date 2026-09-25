/**
 * Match emails. No-op unless RESEND_API_KEY is set.
 * Do not sign up for a provider from this process.
 */

export const MATCH_EMAIL_ENV = "RESEND_API_KEY";

export type EmailSendResult = {
  attempted: boolean;
  sent: boolean;
  error?: string;
};

export function emailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || "").trim());
}

function fromAddress(): string {
  const configured = (process.env.EMAIL_FROM || "").trim();
  if (configured) return configured;
  return "EstateSnipe <alerts@estatesnipe.com>";
}

export async function sendMatchEmail(input: {
  to: string;
  keyword: string;
  title: string;
  url: string;
}): Promise<EmailSendResult> {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { attempted: false, sent: false, error: "invalid email" };
  }
  if (!key) {
    return { attempted: false, sent: false, error: `${MATCH_EMAIL_ENV} not set` };
  }

  const title = input.title.slice(0, 120);
  const keyword = input.keyword.slice(0, 80);
  const text = `EstateSnipe: “${keyword}” may match — ${title}. ${input.url}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: `EstateSnipe match: ${keyword}`,
        text,
      }),
    });
    if (!res.ok) {
      return { attempted: true, sent: false, error: `email provider HTTP ${res.status}` };
    }
    return { attempted: true, sent: true };
  } catch {
    return { attempted: true, sent: false, error: "email send failed" };
  }
}
