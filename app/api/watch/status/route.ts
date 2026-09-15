import { NextResponse } from "next/server";
import { getStoreSnapshot } from "@/lib/store";
import { sources } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight admin/status for the watcher. */
export async function GET() {
  const snap = await getStoreSnapshot();
  return NextResponse.json({
    ok: true,
    sources: sources.map((s) => s.id),
    seenCount: snap.seenIds.length,
    recentMatches: snap.matches.slice(0, 20),
    lastScanAt: snap.lastScanAt,
    note: "In-memory + /tmp JSON store. Production should use DB/KV.",
  });
}
