"use client";

import { AppNav } from "@/components/AppNav";
import { BrandHeader } from "@/components/BrandHeader";
import { ChatHome } from "@/components/ChatHome";
import { InstallBanner } from "@/components/InstallBanner";
import { PhoneShell } from "@/components/PhoneShell";

/** Landing = same chat-first hunt as /app. No separate Chat tab. */
export default function LandingPage() {
  return (
    <PhoneShell>
      <BrandHeader />
      <InstallBanner />
      <AppNav />
      <ChatHome />
    </PhoneShell>
  );
}
