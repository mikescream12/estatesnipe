"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { loadProfile, saveProfile } from "@/lib/watches";

export function ContactConsentForm() {
  const { messages } = useLocale();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState("25");
  const [consentAlerts, setConsentAlerts] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [consentError, setConsentError] = useState(false);

  useEffect(() => {
    const existing = loadProfile();
    if (!existing) return;
    setPhone(existing.phone);
    setEmail(existing.email);
    setZip(existing.zip);
    setRadius(String(existing.radiusMi));
    setConsentAlerts(existing.consentAlerts);
    setConsentMarketing(existing.consentMarketing);
  }, []);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    const phoneTrimmed = phone.trim();
    if (phoneTrimmed && !consentAlerts) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    saveProfile({
      phone: phoneTrimmed,
      email,
      zip,
      radiusMi: Math.max(1, parseInt(radius, 10) || 25),
      consentAlerts,
      consentMarketing,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={onSave} className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="field-label">{messages.zipLabel}</label>
          <input type="text" value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>
        <div>
          <label className="field-label">{messages.radiusLabel}</label>
          <input
            type="text"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder="25"
          />
        </div>
      </div>
      <label className="field-label">{messages.phoneLabel}</label>
      <input
        type="tel"
        placeholder="+1 214 555 0199"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          if (consentError) setConsentError(false);
        }}
      />
      <label className="field-label">{messages.emailLabel}</label>
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="my-2 flex items-start gap-2.5 text-[0.82rem] leading-snug text-ss-muted">
        <input
          type="checkbox"
          className="mt-1"
          checked={consentAlerts}
          onChange={(e) => {
            setConsentAlerts(e.target.checked);
            if (e.target.checked) setConsentError(false);
          }}
        />
        <span>{messages.consentAlerts}</span>
      </label>
      <label className="my-2 flex items-start gap-2.5 text-[0.82rem] leading-snug text-ss-muted">
        <input
          type="checkbox"
          className="mt-1"
          checked={consentMarketing}
          onChange={(e) => setConsentMarketing(e.target.checked)}
        />
        <span>{messages.consentMarketing}</span>
      </label>
      <p className="text-[0.75rem] leading-snug text-ss-muted">
        <Link href="/terms" className="text-ss-accent2 underline">
          {messages.termsLink}
        </Link>
        {" · "}
        <Link href="/privacy" className="text-ss-accent2 underline">
          {messages.privacyLink}
        </Link>
      </p>
      {consentError ? (
        <p className="text-center text-xs text-ss-danger">
          {messages.consentPhoneRequired}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-[14px] border border-ss-line py-3 font-bold text-ss-text"
      >
        {messages.saveContact}
      </button>
      {saved ? (
        <p className="text-center text-xs text-ss-accent2">{messages.contactSaved}</p>
      ) : null}
    </form>
  );
}
