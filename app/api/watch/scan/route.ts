import { NextResponse } from "next/server";
import { clampRadiusMiles } from "@/lib/geoPure";
import { resolveScanBilling } from "@/lib/billing";
import { pickClientPhone } from "@/lib/founder";
import { runScan, type ScanRequest } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Leave headroom under Hobby's ~60s FUNCTION_INVOCATION_TIMEOUT. */
const INTERACTIVE_DEADLINE_MS = 52_000;

type ScanBody = ScanRequest & {
  saleMode?: "both" | "estate" | "auction";
  clientPhone?: string;
  founderPhone?: string;
  flipMode?: boolean;
  minAlertValueUsd?: number | null;
  notifyEmail?: string;
  honorRadius?: boolean;
  includeNearby?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  skipVision?: boolean;
  deadlineMs?: number;
};

export async function POST(request: Request) {
  let body: ScanBody;
  try {
    body = (await request.json()) as ScanBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON. Expected { zip, radiusMiles?, watchTexts: string[] }",
      },
      { status: 400 }
    );
  }

  const phone = pickClientPhone({
    notifyPhone: body.notifyPhone,
    clientPhone: body.clientPhone,
    founderPhone: body.founderPhone,
    headerPhone:
      request.headers.get("x-client-phone") ||
      request.headers.get("x-founder-phone"),
  });

  const billing = await resolveScanBilling(request.headers.get("cookie"), {
    phone,
  });
  const result = await runScan({
    zip: body.zip,
    radiusMiles: body.radiusMiles,
    watchTexts: Array.isArray(body.watchTexts) ? body.watchTexts : [],
    onlyNew: body.onlyNew,
    notifyPhone: body.notifyPhone,
    notifyEmail: body.notifyEmail,
    excludeAuctions: body.excludeAuctions,
    saleMode: body.saleMode,
    billing,
    flipMode: Boolean(body.flipMode),
    minAlertValueUsd:
      typeof body.minAlertValueUsd === "number" &&
      Number.isFinite(body.minAlertValueUsd) &&
      body.minAlertValueUsd > 0
        ? Math.round(body.minAlertValueUsd)
        : null,
    honorRadius: body.honorRadius === true,
    includeNearby: body.includeNearby === true,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    skipVision: body.skipVision === true ? true : undefined,
    // Keep vision unless the chat asks to skip it, and bound wall clock
    // so a cold photo pass degrades to text instead of a 504.
    deadlineMs:
      typeof body.deadlineMs === "number" && Number.isFinite(body.deadlineMs)
        ? body.deadlineMs
        : INTERACTIVE_DEADLINE_MS,
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
  const phone = pickClientPhone({
    notifyPhone: searchParams.get("notifyPhone"),
    clientPhone: searchParams.get("clientPhone"),
    founderPhone: searchParams.get("founderPhone"),
    headerPhone:
      request.headers.get("x-client-phone") ||
      request.headers.get("x-founder-phone"),
  });

  const billing = await resolveScanBilling(request.headers.get("cookie"), {
    phone,
  });
  const result = await runScan({
    zip,
    radiusMiles: radius,
    watchTexts,
    onlyNew: false,
    billing,
    deadlineMs: INTERACTIVE_DEADLINE_MS,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
