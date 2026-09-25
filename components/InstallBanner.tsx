"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/LocaleContext";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallBanner() {
  const { messages } = useLocale();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [dismissed, setDismissed] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    const dismissedAt = localStorage.getItem("estatesnipe.install.dismissed");
    if (!dismissedAt) setDismissed(false);

    const ua = navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua));

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (isStandalone || dismissed) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setDeferred(null);
        setDismissed(true);
      }
      return;
    }
    setShowHelp(true);
  }

  function dismiss() {
    localStorage.setItem("estatesnipe.install.dismissed", Date.now().toString());
    setDismissed(true);
  }

  return (
    <div className="mb-4 rounded-[18px] border border-ss-brand-100 bg-ss-brand-50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-ss-accent">
            {messages.installTitle}
          </div>
          <p className="mt-0.5 text-xs text-ss-muted">{messages.installBlurb}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-ss-muted"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={install}
          className="btn-primary flex-1 py-2.5 text-sm font-bold"
        >
          {messages.installCta}
        </button>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="rounded-[8px] border border-ss-line bg-ss-card px-3 py-2.5 text-xs font-semibold text-ss-text"
        >
          {messages.installHow}
        </button>
      </div>
      {showHelp ? (
        <div className="mt-2 space-y-1.5 whitespace-pre-line text-[0.75rem] leading-snug text-ss-muted">
          <p>{isIos ? messages.installIos : messages.installAndroid}</p>
          <p className="opacity-80">{messages.installBoth}</p>
        </div>
      ) : null}
    </div>
  );
}
