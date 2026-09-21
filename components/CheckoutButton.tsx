"use client";

import { useState } from "react";

export function CheckoutButton({
  label = "Subscribe to Pro",
  disabledReason,
}: {
  label?: string;
  disabledReason?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ plan: "pro" }),
      });
      const data = (await res.json()) as {
        url?: string | null;
        error?: string;
      };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error || "Checkout did not return a session URL.");
    } catch {
      setError("Checkout request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action="/api/stripe" method="POST" onSubmit={start}>
      <button
        type="submit"
        disabled={pending || Boolean(disabledReason)}
        className="w-full rounded-[14px] bg-ss-accent py-3.5 text-base font-bold text-[#1a1206] disabled:opacity-60"
      >
        {pending ? "Opening Checkout…" : label}
      </button>
      {disabledReason ? (
        <p className="mt-2 text-center text-xs text-ss-muted">{disabledReason}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-center text-xs text-ss-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
