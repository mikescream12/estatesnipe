"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHIP_KEYS, type ChipKey } from "@/lib/i18n";
import { useLocale } from "@/lib/LocaleContext";
import { parseWatchIntent } from "@/lib/parseWatchIntent";
import { addWatches, loadProfile } from "@/lib/watches";
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
  defaultZip = "75201",
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

  const profile = useMemo(() => loadProfile(), []);
  const zip = profile?.zip || defaultZip;
  const baseRadius = profile?.radiusMi || defaultRadius;

  function applyParsed(text: string) {
    const parsed = parseWatchIntent(text, locale);
    setMsgs((m) => [
      ...m,
      { role: "user", text },
      { role: "assistant", text: parsed.reply },
    ]);
    if (parsed.keywords.length) {
      setPending(
        parsed.keywords.map((keyword) => ({
          keyword,
          zip: parsed.zip || zip,
          radiusMi: parsed.radiusMi ?? baseRadius,
          excludeAuctions: parsed.excludeAuctions || undefined,
          notes: parsed.notes.length ? parsed.notes : undefined,
        }))
      );
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
    if (!labels.length) {
      setPending(null);
      return;
    }
    applyParsed(labels.join(locale === "es" ? " y " : " and "));
  }

  function confirm() {
    if (!pending?.length) return;
    addWatches(pending);
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

      <div className="flex max-h-[340px] min-h-[180px] flex-col gap-2 overflow-y-auto rounded-[18px] border border-ss-line bg-[#0b0d11] p-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-[0.9rem] leading-snug ${
              m.role === "user"
                ? "ml-auto rounded-br-md bg-[#1f6feb] text-white"
                : "mr-auto rounded-bl-md bg-ss-card text-ss-text"
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
        <div className="rounded-[18px] border border-ss-accent2 bg-[rgba(61,214,198,0.08)] p-4">
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
                <span className="text-ss-muted">
                  {" "}
                  · {w.zip} · {w.radiusMi} mi
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
            className="w-full rounded-[14px] bg-gradient-to-br from-ss-accent to-[#f0c27b] py-3.5 text-base font-bold text-[#1a1208]"
          >
            {messages.chatConfirmCta}
          </button>
        </div>
      ) : null}

      <form onSubmit={onSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.chatPlaceholder}
          className="flex-1"
          aria-label={messages.chatPlaceholder}
          autoFocus
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-gradient-to-br from-ss-accent to-[#f0c27b] px-4 font-bold text-[#1a1208]"
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
