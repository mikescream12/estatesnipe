"use client";

import { AppNav } from "@/components/AppNav";
import { BrandHeader } from "@/components/BrandHeader";
import { ChatHome } from "@/components/ChatHome";
import { InstallBanner } from "@/components/InstallBanner";
import { PhoneShell } from "@/components/PhoneShell";
/** Alias of the chat-first hero — same experience as `/`. */
export default function ChatSetupPage() {
  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />
      <AppNav />
      <ChatHome />
    </PhoneShell>
  );
}
