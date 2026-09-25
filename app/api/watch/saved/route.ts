import { readSavedWatches, savedWatchClientIdOk, writeSavedWatches } from "@/lib/savedWatches";

export const dynamic = "force-dynamic";

type Body = {
  clientId?: string;
  phone?: string;
  email?: string;
  consentAlerts?: boolean;
  consentMarketing?: boolean;
  minAlertValueUsd?: number | null;
  saleMode?: string;
  watches?: Array<{
    id?: string;
    keyword?: string;
    zip?: string;
    radiusMi?: number;
    excludeAuctions?: boolean;
  }>;
};

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!savedWatchClientIdOk(clientId)) {
    return Response.json({ ok: false, error: "clientId required" }, { status: 400 });
  }
  const record = await readSavedWatches(clientId);
  return Response.json({ ok: true, record });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const clientId = (body.clientId || "").trim();
  if (!savedWatchClientIdOk(clientId)) {
    return Response.json({ ok: false, error: "clientId required" }, { status: 400 });
  }
  const saleMode =
    body.saleMode === "estate" || body.saleMode === "auction" || body.saleMode === "both"
      ? body.saleMode
      : "both";
  const min =
    typeof body.minAlertValueUsd === "number" &&
    Number.isFinite(body.minAlertValueUsd) &&
    body.minAlertValueUsd > 0
      ? Math.round(body.minAlertValueUsd)
      : null;
  const watches = (body.watches || [])
    .filter((w) => w && typeof w.keyword === "string" && w.keyword.trim())
    .slice(0, 40)
    .map((w) => ({
      id: String(w.id || ""),
      keyword: String(w.keyword).slice(0, 80),
      zip: String(w.zip || ""),
      radiusMi: Number(w.radiusMi) || 25,
      excludeAuctions: Boolean(w.excludeAuctions),
    }));
  const result = await writeSavedWatches({
    clientId,
    phone: String(body.phone || ""),
    email: String(body.email || ""),
    consentAlerts: Boolean(body.consentAlerts),
    consentMarketing: Boolean(body.consentMarketing),
    minAlertValueUsd: min,
    saleMode,
    watches,
  });
  return Response.json({ ok: true, stored: result.stored });
}
