import { NextResponse } from "next/server";
import { clampRadiusMiles } from "@/lib/geoPure";
import { resolveScanBilling } from "@/lib/billing";
import { runScan, type ScanRequest } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON. Expected { zip, radiusMiles?, watchTexts: string[] }",
      },
      { status: 400 }
    );
  }

  const billing = await resolveScanBilling(request.headers.get("cookie"));
  const result = await runScan({
    zip: body.zip,
    radiusMiles: body.radiusMiles,
    watchTexts: Array.isArray(body.watchTexts) ? body.watchTexts : [],
    onlyNew: body.onlyNew,
    notifyPhone: body.notifyPhone,
    excludeAuctions: body.excludeAuctions,
    skipVision: body.skipVision,
    deadlineMs: body.deadlineMs,
    honorRadius: body.honorRadius,
    includeNearby: body.includeNearby,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    saleMode: body.saleMode,
    billing,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/** GET helper for quick manual checks: /api/watch/scan?zip=92886&q=sterling */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip") || "";
  const q = searchParams.get("q") || searchParams.get("watch") || "";
  const radius = clampRadiusMiles(searchParams.get("radius"), 25);
  const watchTexts = q
    ? q.split("|").map((s) => s.trim()).filter(Boolean)
    : ["estate"];

  const billing = await resolveScanBilling(request.headers.get("cookie"));
  const result = await runScan({
    zip,
    radiusMiles: radius,
    watchTexts,
    onlyNew: false,
    billing,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
