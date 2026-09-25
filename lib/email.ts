/**
 * Match email. Sender is a no-op until RESEND_API_KEY and RESEND_FROM are set.
 */
export async function sendMatchEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM || "").trim();
  const to = opts.to.trim();
  if (!to || !to.includes("@")) return { sent: false, reason: "no recipient" };
  if (!key || !from) return { sent: false, reason: "email not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: opts.subject.slice(0, 180),
      text: opts.text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    return { sent: false, reason: `email provider responded ${res.status}` };
  }
  return { sent: true };
}
