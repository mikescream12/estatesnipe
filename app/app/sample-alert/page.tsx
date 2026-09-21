"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppNav } from "../../../components/AppNav";
import { BrandHeader } from "../../../components/BrandHeader";
import { PhoneShell } from "../../../components/PhoneShell";
import { useLocale } from "../../../lib/LocaleContext";
import { loadProfile } from "../../../lib/watches";

export default function SampleAlertPage() {
  const { messages } = useLocale();
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">(
    "idle"
  );
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const profile = loadProfile();
    if (profile?.phone) setPhone(profile.phone);
  }, []);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!smsConsent) {
      setStatus("err");
      setStatusMsg(messages.consentPhoneRequired);
      return;
    }
    setStatus("sending");
    setStatusMsg("");
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sid?: string;
        error?: string;
      };
      if (data.ok && data.sid) {
        setStatus("ok");
        setStatusMsg(`${messages.smsSent} ${data.sid}`);
      } else {
        setStatus("err");
        setStatusMsg(data.error || messages.smsFailed);
      }
    } catch {
      setStatus("err");
      setStatusMsg(messages.smsFailed);
    }
  }

  return (
    <PhoneShell>
      <BrandHeader />
      <AppNav />

      <div className="mb-2.5 inline-block rounded-full bg-[rgba(61,214,198,0.15)] px-2 py-1 text-[0.72rem] font-bold text-ss-accent2">
        {messages.alertPill}
      </div>
      <h1 className="mb-2 text-[1.7rem] font-bold leading-tight tracking-tight">
        {messages.alertTitle}
      </h1>
      <p className="mb-5 text-[0.95rem] text-ss-muted">{messages.alertSub}</p>

      <div className="rounded-[18px] border border-ss-line bg-[#0b0d11] p-3.5">
        <div className="ml-auto max-w-[92%] rounded-[18px] rounded-br-md bg-[#1f6feb] p-3 text-[0.9rem] leading-snug text-white">
          <div className="mb-2 grid h-[140px] place-items-center rounded-xl bg-gradient-to-br from-[#3a2f1f] to-[#6b4e2e] text-[0.95rem] font-bold text-[#f5e6c8]">
            {messages.alertPhoto}
          </div>
          <strong>EstateSnipe:</strong> {messages.alertMatch}
          <br />
          {messages.alertSale}
          <br />
          {messages.alertDoors}
          <div className="mt-1.5 text-[0.82rem] text-white/85">
            {messages.alertLink}
          </div>
        </div>
      </div>

      <form
        onSubmit={onSend}
        className="mt-4 rounded-[18px] border border-ss-line bg-ss-card p-3.5"
      >
        <p className="mb-2 text-[0.95rem] font-semibold text-ss-text">
          {messages.smsFormTitle}
        </p>
        <p className="mb-3 text-[0.78rem] leading-snug text-ss-muted">
          {messages.smsFormHint}
        </p>
        <label className="field-label" htmlFor="sms-to">
          {messages.phoneLabel}
        </label>
        <input
          id="sms-to"
          type="tel"
          placeholder="+12145550199"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          required
        />
        <label className="my-2 flex items-start gap-2.5 text-[0.82rem] leading-snug text-ss-muted">
          <input
            type="checkbox"
            className="mt-1"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
          />
          <span>{messages.consentAlerts}</span>
        </label>
        <p className="mb-2 text-[0.75rem] leading-snug text-ss-muted">
          <Link href="/terms" className="text-ss-accent2 underline">
            {messages.termsLink}
          </Link>
          {" · "}
          <Link href="/privacy" className="text-ss-accent2 underline">
            {messages.privacyLink}
          </Link>
        </p>
        <button
          type="submit"
          disabled={status === "sending" || !phone.trim() || !smsConsent}
          className="mt-3 w-full rounded-[14px] bg-gradient-to-br from-ss-accent to-[#f0c27b] py-3.5 text-center text-base font-bold text-[#1a1208] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? messages.smsSending : messages.smsSendCta}
        </button>
        {status === "ok" ? (
          <p className="mt-2 text-center text-xs text-ss-accent2">{statusMsg}</p>
        ) : null}
        {status === "err" ? (
          <p className="mt-2 text-center text-xs text-ss-danger">{statusMsg}</p>
        ) : null}
      </form>

      <Link
        href="/"
        className="mt-4 block w-full rounded-[14px] border border-ss-line py-3.5 text-center text-base font-bold text-ss-text"
      >
        {messages.backSignup}
      </Link>
      <p className="mt-3 text-center text-[0.72rem] text-ss-muted">
        {messages.workingName}
      </p>
    </PhoneShell>
  );
}
