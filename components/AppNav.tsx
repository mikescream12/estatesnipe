"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/LocaleContext";

const links = [
  { href: "/", key: "navLanding" as const, match: (p: string) => p === "/" },
  { href: "/app", key: "navHome" as const, match: (p: string) => p === "/app" },
  {
    href: "/app/sample-alert",
    key: "navSample" as const,
    match: (p: string) => p.startsWith("/app/sample-alert"),
  },
];

export function AppNav() {
  const pathname = usePathname();
  const { messages } = useLocale();

  return (
    <nav className="mb-3 grid grid-cols-3 gap-2">
      {links.map((l) => {
        const on = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-xl border px-2 py-2.5 text-center text-xs font-semibold ${
              on
                ? "border-ss-accent2 bg-[rgba(61,214,198,0.1)] text-ss-text"
                : "border-ss-line text-ss-muted"
            }`}
          >
            {messages[l.key]}
          </Link>
        );
      })}
    </nav>
  );
}
