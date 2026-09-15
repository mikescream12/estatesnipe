import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";
import { getStoreSnapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron compatible endpoint.
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Watches for cron are configured via env:
 *   CRON_ZIP=75201
 *   CRON_RADIUS_MILES=25
 *   CRON_WATCH_TEXTS=sterling|hen on a nest|pokemon
 *   CRON_NOTIFY_PHONE=+1... (optional)
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

  const zip = (process.env.CRON_ZIP || "75201").trim();
  const radiusMiles = Number(process.env.CRON_RADIUS_MILES || "25");
  const watchTexts = (process.env.CRON_WATCH_TEXTS || "sterling|pokemon|mcm")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const notifyPhone = process.env.CRON_NOTIFY_PHONE || undefined;

  const result = await runScan({
    zip,
    radiusMiles,
    watchTexts,
    onlyNew: true,
    notifyPhone,
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
