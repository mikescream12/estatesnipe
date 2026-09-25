"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_KEYS, CHIP_KEYS, type CategoryKey, type ChipKey } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import { preferredZip } from "@/lib/geoPure";
import { parseWatchIntent, splitAskKeywords } from "@/lib/parseWatchIntent";
import { addWatches, loadProfile, saveProfile } from "@/lib/watches";
import { pushLocalState } from "@/lib/watchSync";
import { Chip } from "@/components/Chip";

type Msg = { role: "user" | "assistant"; text: string };

type PendingWatch = {
  keyword: string;
  zip: string;
  radiusMi: number;
  excludeAuctions?: boolean;
  notes?: string[];
};

export function HuntChat({
  defaultZip = "",
  defaultRadius = 25,
  compactChips = true,
}: {
  defaultZip?: string;
  defaultRadius?: number;
  compactChips?: boolean;
}) {
  const { locale, messages } = useLocale();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: messages.chatIntro },
  ]);
  const [pending, setPending] = useState<PendingWatch[] | null>(null);
  const [chipOn, setChipOn] = useState<Record<string, boolean>>({});
  const [showChips, setShowChips] = useState(!compactChips);
  const [zip, setZip] = useState(defaultZip);
  const [radiusMi, setRadiusMi] = useState(String(defaultRadius));

  useEffect(() => {
    const profile = loadProfile();
    if (profile?.zip) setZip(profile.zip);
    if (profile?.radiusMi) setRadiusMi(String(profile.radiusMi));
    void pushLocalState();
  }, []);

  function currentRadius(): number {
    return Math.max(1, Math.min(parseInt(radiusMi, 10) || defaultRadius, 100));
  }

  function applyZipToPending(nextZip: string, nextRadius?: number) {
    setPending((p) =>
      p
        ? p.map((w) => ({
            ...w,
            zip: nextZip || w.zip,
            radiusMi: nextRadius ?? w.radiusMi,
          }))
        : p
    );
  }

  function onZipChange(value: string) {
    const cleaned = value.replace(/[^\d]/g, "").slice(0, 5);
    setZip(cleaned);
    applyZipToPending(cleaned, currentRadius());
  }

  function onRadiusChange(value: string) {
    setRadiusMi(value);
    const n = Math.max(1, Math.min(parseInt(value, 10) || defaultRadius, 100));
    applyZipToPending(zip.trim(), n);
  }

  function applyParsed(text: string) {
    const parsed = parseWatchIntent(text, locale);
    // Zip field wins. A 5-digit number in the sentence cannot move the search.
    const activeZip = preferredZip(zip, parsed.zip);
    const activeRadius = parsed.radiusMi ?? currentRadius();
    if (!/^\d{5}$/.test(zip.trim()) && activeZip) setZip(activeZip);
    if (parsed.radiusMi != null) setRadiusMi(String(parsed.radiusMi));

    setMsgs((m) => [
      ...m,
      { role: "user", text },
      { role: "assistant", text: parsed.reply },
    ]);
    if (parsed.keywords.length) {
      // One watch holds the whole list. Commas must not spawn a watch per word.
      const asks = splitAskKeywords(text);
      const keyword =
        asks.length > 1 ? asks.join(", ") : parsed.keywords[0];
      setPending([
        {
          keyword,
          zip: activeZip,
          radiusMi: activeRadius,
          excludeAuctions: parsed.excludeAuctions || undefined,
          notes: parsed.notes.length ? parsed.notes : undefined,
        },
      ]);
    } else {
      setPending(null);
    }
  }

  function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    applyParsed(text);
  }

  function onChip(key: ChipKey) {
    const next = { ...chipOn, [key]: !chipOn[key] };
    setChipOn(next);
    const labels = CHIP_KEYS.filter((k) => next[k]).map((k) => messages[k]);
    // Fill composer only — user edits, then taps Send.
    setInput(labels.join(locale === "es" ? " y " : " and "));
    setPending(null);
  }

  function confirm() {
    if (!pending?.length) return;
    const finalZip = preferredZip(zip, null);
    if (!/^\d{5}$/.test(finalZip)) {
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text:
            locale === "es"
              ? "Necesito un código postal de 5 dígitos antes de buscar cerca de ti."
              : "Enter a 5-digit US zip before I watch nearby sales.",
        },
      ]);
      return;
    }
    const finalRadius = currentRadius();
    const watches = pending.map((w) => ({
      ...w,
      zip: finalZip,
      radiusMi: finalRadius,
    }));
    addWatches(watches);
    const profile = loadProfile();
    if (profile) {
      saveProfile({ ...profile, zip: finalZip, radiusMi: finalRadius });
    } else {
      saveProfile({
        phone: "",
        email: "",
        zip: finalZip,
        radiusMi: finalRadius,
        consentAlerts: false,
        consentMarketing: false,
      });
    }
    void pushLocalState();
    setMsgs((m) => [
      ...m,
      { role: "assistant", text: messages.chatConfirmDone },
    ]);
    setPending(null);
    router.push("/app");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.72rem] text-ss-muted">{messages.chatDemoNote}</p>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block text-[0.78rem] uppercase tracking-wide text-ss-muted">
          {messages.zipLabel}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            value={zip}
            onChange={(e) => onZipChange(e.target.value)}
            className="mt-1.5 w-full"
            aria-label={messages.zipLabel}
            placeholder="92886"
          />
        </label>
        <label className="block text-[0.78rem] uppercase tracking-wide text-ss-muted">
          {messages.radiusLabel}
          <input
            type="number"
            min={1}
            max={100}
            value={radiusMi}
            onChange={(e) => onRadiusChange(e.target.value)}
            className="mt-1.5 w-full"
            aria-label={messages.radiusLabel}
          />
        </label>
      </div>

      <div className="flex max-h-[340px] min-h-[180px] flex-col gap-2 overflow-y-auto rounded-[20px] border border-ss-line bg-ss-card p-3.5 shadow-[0_8px_28px_rgba(33,29,23,0.06)]">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-[0.9rem] leading-snug ${
              m.role === "user"
                ? "ml-auto rounded-br-md bg-ss-accent text-white"
                : "mr-auto rounded-bl-md bg-ss-bg text-ss-text ring-1 ring-ss-line"
            }`}
          >
            <div className="mb-0.5 text-[0.68rem] font-semibold opacity-70">
              {m.role === "user" ? messages.chatYou : messages.chatAssistant}
            </div>
            {m.text}
          </div>
        ))}
      </div>

      {pending && pending.length > 0 ? (
        <div className="rounded-[18px] border border-ss-brand-100 bg-ss-brand-50 p-4">
          <div className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-ss-accent2">
            {messages.chatConfirmTitle}
          </div>
          <ul className="mb-3 space-y-2">
            {pending.map((w, i) => (
              <li
                key={i}
                className="rounded-xl border border-ss-line bg-ss-card px-3 py-2 text-sm"
              >
                <strong className="text-ss-accent">{w.keyword}</strong>
                {splitAskKeywords(w.keyword).length > 1 ? (
                  <div className="mt-0.5 text-[0.72rem] text-ss-accent2">
                    Any of: {splitAskKeywords(w.keyword).join(" · ")}
                  </div>
                ) : null}
                <span className="text-ss-muted">
                  {" "}
                  · {zip.trim() || w.zip} · {currentRadius()} mi
                  {w.excludeAuctions
                    ? locale === "es"
                      ? " · sin subastas"
                      : " · skip auctions"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={confirm}
            className="btn-primary w-full py-3.5 text-base font-bold"
          >
            {messages.chatConfirmCta}
          </button>
        </div>
      ) : null}

      <label className="block text-[0.78rem] uppercase tracking-wide text-ss-muted">
        {messages.catLabel}
        <select
          className="mt-1.5 w-full"
          defaultValue=""
          aria-label={messages.catLabel}
          onChange={(e) => {
            const key = e.target.value as CategoryKey | "";
            if (!key) return;
            setInput(messages[key]);
            e.target.value = "";
          }}
        >
          <option value="">{messages.catPlaceholder}</option>
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {messages[key]}
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={onSend} className="relative z-20 flex gap-2">
        <input
          type="text"
          name="hunt"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.chatPlaceholder}
          className="relative z-20 min-w-0 flex-1 basis-0 touch-manipulation select-text text-[16px]"
          style={{ width: "auto", WebkitUserSelect: "text", pointerEvents: "auto" }}
          aria-label={messages.chatPlaceholder}
          readOnly={false}
          disabled={false}
        />
        <button
          type="submit"
          className="btn-primary relative z-20 shrink-0 px-4 font-bold"
        >
          {messages.chatSend}
        </button>
      </form>

      <div>
        <button
          type="button"
          onClick={() => setShowChips((s) => !s)}
          className="mb-2 text-[0.78rem] text-ss-muted underline-offset-2 hover:underline"
        >
          {showChips ? messages.chatHideChips : messages.chatQuickChips}
        </button>
        {showChips ? (
          <div className="flex flex-wrap gap-2">
            {CHIP_KEYS.map((key) => (
              <Chip
                key={key}
                label={messages[key]}
                active={!!chipOn[key]}
                onClick={() => onChip(key)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
