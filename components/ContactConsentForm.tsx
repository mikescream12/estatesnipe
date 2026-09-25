"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { loadProfile, saveProfile } from "@/lib/watches";
import { isFounderPhone } from "@/lib/founder";
import { FREE_RADIUS_MI, PRO_MAX_RADIUS_MI } from "@/lib/plans";
import { pushLocalState } from "@/lib/watchSync";

export function ContactConsentForm() {
  const { messages } = useLocale();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState("25");
  const [consentAlerts, setConsentAlerts] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const maxR = isFounderPhone(phone) ? PRO_MAX_RADIUS_MI : FREE_RADIUS_MI;
    const radiusMi = Math.min(
      Math.max(1, parseInt(radius, 10) || FREE_RADIUS_MI),
      maxR
    );
    saveProfile({
      phone,
      email,
      zip,
      radiusMi,
      consentAlerts,
      consentMarketing,
    });
    void pushLocalState();
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
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder="25"
            min={1}
            max={isFounderPhone(phone) ? PRO_MAX_RADIUS_MI : FREE_RADIUS_MI}
          />
        </div>
      </div>
      <label className="field-label">{messages.phoneLabel}</label>
      <input
        type="tel"
        placeholder="7143459641"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
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
          onChange={(e) => setConsentAlerts(e.target.checked)}
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
      <button
        type="submit"
        className="w-full rounded-[14px] border border-ss-line py-3 font-bold text-ss-text"
      >
        {messages.saveContact}
      </button>
      <p className="text-center text-[0.72rem] leading-snug text-ss-muted">
        By checking the SMS box above (unchecked by default) you opt in to
        recurring estate-sale match alerts from EstateSnipe. Message frequency
        varies — up to several alerts per day when matches are found. Msg &amp;
        data rates may apply. Reply STOP to cancel, HELP for help.{" "}
        <a
          href="https://www.estatesnipe.com/privacy"
          className="text-ss-accent2 underline"
        >
          Privacy Policy
        </a>{" "}
        ·{" "}
        <a
          href="https://www.estatesnipe.com/terms"
          className="text-ss-accent2 underline"
        >
          Terms
        </a>
        .
      </p>
      {saved ? (
        <p className="text-center text-xs text-ss-accent2">{messages.contactSaved}</p>
      ) : null}
    </form>
  );
}
