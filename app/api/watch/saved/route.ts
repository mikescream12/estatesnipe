import { NextResponse } from "next/server";
import {
  deleteClient,
  isSafeClientId,
  listClient,
  upsertClient,
  watchStoreReady,
  type UpsertInput,
} from "@/lib/savedWatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser sync for saved watches.
 * POST replaces the document for clientId (full local list + profile).
 * GET lists that client's watches. DELETE removes the document.
 */
export async function POST(request: Request) {
  let body: UpsertInput;
  try {
    body = (await request.json()) as UpsertInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await upsertClient(body);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, watches: result.watches, count: result.watches.length });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save watches" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!watchStoreReady()) {
    return NextResponse.json(
      { ok: false, error: "Watch store unavailable. BLOB_READ_WRITE_TOKEN is not set." },
      { status: 503 }
    );
  }
  const clientId = new URL(request.url).searchParams.get("clientId") || "";
  if (!isSafeClientId(clientId)) {
    return NextResponse.json(
      { ok: false, error: "clientId query param required" },
      { status: 400 }
    );
  }
  try {
    const watches = await listClient(clientId);
    return NextResponse.json({ ok: true, clientId, watches, count: watches.length });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not list watches" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!watchStoreReady()) {
    return NextResponse.json(
      { ok: false, error: "Watch store unavailable. BLOB_READ_WRITE_TOKEN is not set." },
      { status: 503 }
    );
  }
  const urlId = new URL(request.url).searchParams.get("clientId") || "";
  let clientId = urlId;
  if (!clientId) {
    try {
      const body = (await request.json()) as { clientId?: string };
      clientId = String(body.clientId || "");
    } catch {
      clientId = "";
    }
  }
  if (!isSafeClientId(clientId)) {
    return NextResponse.json(
      { ok: false, error: "clientId query param required" },
      { status: 400 }
    );
  }
  try {
    const deleted = await deleteClient(clientId);
    return NextResponse.json({ ok: deleted, clientId, deleted });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not delete watches" }, { status: 500 });
  }
}
