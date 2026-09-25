"use client";

import { AppNav } from "@/components/AppNav";
import { BrandHeader } from "@/components/BrandHeader";
import { ChatHome } from "@/components/ChatHome";
import { InstallBanner } from "@/components/InstallBanner";
import { PhoneShell } from "@/components/PhoneShell";

/** Default /app = ChatGPT-style chat-first hunt. */
export default function AppHomePage() {
  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />
      <AppNav />
      <ChatHome />
    </PhoneShell>
  );
}
