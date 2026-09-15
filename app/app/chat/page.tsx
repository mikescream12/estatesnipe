"use client";

import { AppNav } from "@/components/AppNav";
import { BrandHeader } from "@/components/BrandHeader";
import { HuntChat } from "@/components/HuntChat";
import { InstallBanner } from "@/components/InstallBanner";
import { PhoneShell } from "@/components/PhoneShell";
import { useLocale } from "@/lib/LocaleContext";

/** Alias of the chat-first hero — same experience as `/`. */
export default function ChatSetupPage() {
  const { messages } = useLocale();

  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />
      <AppNav />
      <h1 className="mb-1 text-xl font-bold tracking-tight">{messages.chatTitle}</h1>
      <p className="mb-4 text-sm text-ss-muted">{messages.chatIntro}</p>
      <div className="rounded-[18px] border border-ss-line bg-ss-card p-4">
        <HuntChat />
      </div>
    </PhoneShell>
  );
}
