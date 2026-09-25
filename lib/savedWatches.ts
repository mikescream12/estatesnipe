/**
 * Durable watches. One document per browser client id, stored in Vercel Blob.
 * A keyword string is kept whole ("gold. silver jewelry, cards") — never split into watches.
 */

import { randomUUID } from "crypto";
import {
  blobConfigured,
  deleteBlob,
  listBlobPathnames,
  readBlobJson,
  writeBlobJson,
} from "./blobJson";
import { normalizePhone } from "./phone";

export type SaleMode = "both" | "estate" | "auction";

export type SavedWatch = {
  id: string;
  clientId: string;
  keyword: string;
  zip: string;
  radiusMi: number;
  excludeAuctions: boolean;
  saleMode: SaleMode;
  phone: string;
  email: string;
  consentAlerts: boolean;
  consentMarketing: boolean;
  minAlertValueUsd: number | null;
  updatedAt: string;
};

type StoredWatch = {
  id: string;
  keyword: string;
  zip: string;
  radiusMi: number;
  excludeAuctions: boolean;
  saleMode: SaleMode;
};

type ClientDoc = {
  clientId: string;
  phone: string;
  email: string;
  consentAlerts: boolean;
  consentMarketing: boolean;
  saleMode: SaleMode;
  minAlertValueUsd: number | null;
  updatedAt: string;
  watches: StoredWatch[];
};

const PREFIX = "watches/clients/";

export function watchStoreReady(): boolean {
  return blobConfigured();
}

export function isSafeClientId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

function pathFor(clientId: string): string {
  return `${PREFIX}${clientId}.json`;
}

export function saleModeOf(value: unknown): SaleMode {
  return value === "estate" || value === "auction" || value === "both" ? value : "both";
}

function readMinAlert(doc: Partial<ClientDoc> | null | undefined): number | null {
  const n = doc?.minAlertValueUsd;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.round(n);
  return null;
}


export type UpsertWatchInput = {
  id?: string;
  keyword?: string;
  zip?: string;
  radiusMi?: number;
  excludeAuctions?: boolean;
  saleMode?: unknown;
};

export type UpsertInput = {
  clientId?: string;
  phone?: string;
  email?: string;
  consentAlerts?: boolean;
  consentMarketing?: boolean;
  saleMode?: unknown;
  minAlertValueUsd?: number | null;
  watches?: UpsertWatchInput[];
};

function flatten(doc: ClientDoc): SavedWatch[] {
  return doc.watches.map((w) => ({
    id: w.id,
    clientId: doc.clientId,
    keyword: w.keyword,
    zip: w.zip,
    radiusMi: w.radiusMi,
    excludeAuctions: w.excludeAuctions,
    saleMode: w.saleMode || doc.saleMode,
    phone: doc.phone,
    email: doc.email,
    consentAlerts: doc.consentAlerts,
    consentMarketing: doc.consentMarketing,
    minAlertValueUsd: doc.minAlertValueUsd ?? null,
    updatedAt: doc.updatedAt,
  }));
}

export function normalizeUpsert(input: UpsertInput): { doc: ClientDoc } | { error: string } {
  const clientId = String(input.clientId || "").trim();
  if (!isSafeClientId(clientId)) {
    return { error: "clientId must be 8-80 characters [A-Za-z0-9_-]" };
  }
  const rawPhone = String(input.phone || "").trim().slice(0, 32);
  const phone = normalizePhone(rawPhone) || rawPhone;
  const email = String(input.email || "").trim().slice(0, 200);
  const consentAlerts = Boolean(input.consentAlerts);
  const consentMarketing = Boolean(input.consentMarketing);
  const saleMode = saleModeOf(input.saleMode);
  const minRaw = input.minAlertValueUsd;
  const minAlertValueUsd =
    typeof minRaw === "number" && Number.isFinite(minRaw) && minRaw > 0
      ? Math.min(100_000, Math.round(minRaw))
      : null;
  const raw = Array.isArray(input.watches) ? input.watches.slice(0, 40) : [];
  const watches: StoredWatch[] = [];
  for (const w of raw) {
    const keyword = String(w?.keyword || "").trim().slice(0, 300);
    const zip = String(w?.zip || "").trim();
    if (!keyword || !/^\d{5}$/.test(zip)) continue;
    const radius = Number(w?.radiusMi);
    const radiusMi = Number.isFinite(radius)
      ? Math.max(1, Math.min(100, Math.round(radius)))
      : 25;
    let id = String(w?.id || "").trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) id = randomUUID();
    watches.push({
      id,
      keyword,
      zip,
      radiusMi,
      excludeAuctions: Boolean(w?.excludeAuctions),
      saleMode: saleModeOf(w?.saleMode ?? saleMode),
    });
  }
  return {
    doc: {
      clientId,
      phone,
      email,
      consentAlerts,
      consentMarketing,
      saleMode,
      minAlertValueUsd,
      updatedAt: new Date().toISOString(),
      watches,
    },
  };
}

export async function upsertClient(
  input: UpsertInput
): Promise<
  | { ok: true; watches: SavedWatch[] }
  | { ok: false; error: string; status: number }
> {
  if (!watchStoreReady()) {
    return {
      ok: false,
      error: "Watch store unavailable. BLOB_READ_WRITE_TOKEN is not set.",
      status: 503,
    };
  }
  const normalized = normalizeUpsert(input);
  if ("error" in normalized) {
    return { ok: false, error: normalized.error, status: 400 };
  }
  await writeBlobJson(pathFor(normalized.doc.clientId), normalized.doc);
  return { ok: true, watches: flatten(normalized.doc) };
}

export async function listClient(clientId: string): Promise<SavedWatch[]> {
  if (!isSafeClientId(clientId) || !watchStoreReady()) return [];
  const doc = await readBlobJson<ClientDoc>(pathFor(clientId));
  if (!doc || !Array.isArray(doc.watches)) return [];
  return flatten({
    clientId: String(doc.clientId || clientId),
    phone: String(doc.phone || ""),
    email: String(doc.email || ""),
    consentAlerts: Boolean(doc.consentAlerts),
    consentMarketing: Boolean(doc.consentMarketing),
    saleMode: saleModeOf(doc.saleMode),
    minAlertValueUsd: readMinAlert(doc),
    updatedAt: String(doc.updatedAt || ""),
    watches: doc.watches.map((w) => ({
      id: String(w.id || ""),
      keyword: String(w.keyword || ""),
      zip: String(w.zip || ""),
      radiusMi: Number(w.radiusMi) || 25,
      excludeAuctions: Boolean(w.excludeAuctions),
      saleMode: saleModeOf(w.saleMode || doc.saleMode),
    })),
  });
}

export async function deleteClient(clientId: string): Promise<boolean> {
  if (!isSafeClientId(clientId)) return false;
  await deleteBlob(pathFor(clientId));
  return true;
}

export async function listAllSavedWatches(): Promise<SavedWatch[]> {
  if (!watchStoreReady()) return [];
  const paths = await listBlobPathnames(PREFIX);
  const all: SavedWatch[] = [];
  for (const pathname of paths) {
    if (!pathname.endsWith(".json")) continue;
    const doc = await readBlobJson<ClientDoc>(pathname);
    if (!doc || !Array.isArray(doc.watches)) continue;
    all.push(
      ...flatten({
        clientId: String(doc.clientId || ""),
        phone: String(doc.phone || ""),
        email: String(doc.email || ""),
        consentAlerts: Boolean(doc.consentAlerts),
        consentMarketing: Boolean(doc.consentMarketing),
        saleMode: saleModeOf(doc.saleMode),
        minAlertValueUsd: readMinAlert(doc),
        updatedAt: String(doc.updatedAt || ""),
        watches: doc.watches.map((w) => ({
          id: String(w.id || ""),
          keyword: String(w.keyword || ""),
          zip: String(w.zip || ""),
          radiusMi: Number(w.radiusMi) || 25,
          excludeAuctions: Boolean(w.excludeAuctions),
          saleMode: saleModeOf(w.saleMode || doc.saleMode),
        })),
      })
    );
  }
  return all.filter((w) => w.clientId && w.keyword && /^\d{5}$/.test(w.zip));
}
