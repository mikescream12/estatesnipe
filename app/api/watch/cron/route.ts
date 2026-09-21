import { NextResponse } from "next/server";
import { clampRadiusMiles } from "@/lib/geoPure";
import { runScan } from "@/lib/scan";
import { getStoreSnapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby ceiling is 60s — scan must finish earlier via deadlineMs. */
export const maxDuration = 60;

/**
 * Vercel Cron compatible endpoint.
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Watches for cron are configured via env:
 *   CRON_ZIP=92886
 *   CRON_RADIUS_MILES=25
 *   CRON_WATCH_TEXTS=sterling|hen on a nest|pokemon
 *   CRON_NOTIFY_PHONE=+1... (optional)
 *
 * Timing: vision is off by default on this path (set CRON_ENABLE_VISION=1 to
 * opt in). Overall budget ~50s with per-source timeouts so Hobby does not 504.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET not set. Add it in Vercel env and pass Authorization: Bearer …",
      },
      { status: 503 }
    );
  }
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const zip = (process.env.CRON_ZIP || "").trim();
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_ZIP must be a 5-digit US zip. Refusing to scan a default city.",
      },
      { status: 400 }
    );
  }
  const radiusMiles = clampRadiusMiles(process.env.CRON_RADIUS_MILES, 25);
  const watchTexts = (process.env.CRON_WATCH_TEXTS || "sterling|pokemon|mcm")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const notifyPhone = process.env.CRON_NOTIFY_PHONE || undefined;
  // Default: skip vision on cron. Opt in with CRON_ENABLE_VISION=1.
  const skipVision = !/^(1|true|yes|on)$/i.test(
    (process.env.CRON_ENABLE_VISION || "").trim()
  );

  const result = await runScan({
    zip,
    radiusMiles,
    watchTexts,
    onlyNew: true,
    notifyPhone,
    skipVision,
    deadlineMs: 50_000,
  });

  const snap = await getStoreSnapshot();
  return NextResponse.json({
    ...result,
    store: {
      seenCount: snap.seenIds.length,
      matchCount: snap.matches.length,
      lastScanAt: snap.lastScanAt,
    },
  });
}
