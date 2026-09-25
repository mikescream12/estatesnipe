"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/LocaleContext";

/** One Home = chat hunt. No separate Chat tab. */
const links = [
  {
    href: "/",
    key: "navHome" as const,
    match: (p: string) =>
      p === "/" || p === "/app" || p.startsWith("/app/chat"),
  },
  {
    href: "/app/sample-alert",
    key: "tabAlert" as const,
    match: (p: string) => p.startsWith("/app/sample-alert"),
  },
];

export function AppNav() {
  const pathname = usePathname();
  const { messages } = useLocale();

  return (
    <nav className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-[#efebe3] p-1">
      {links.map((l) => {
        const on = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-2 py-2.5 text-center text-xs font-bold transition ${
              on
                ? "bg-ss-accent text-white shadow-sm"
                : "text-ss-muted hover:text-ss-text"
            }`}
          >
            {messages[l.key]}
          </Link>
        );
      })}
    </nav>
  );
}
