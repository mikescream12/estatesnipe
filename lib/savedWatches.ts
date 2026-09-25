import { readBlobJson, writeBlobJson, blobConfigured } from "./blobJson";

export type SavedWatch = {
  id: string;
  keyword: string;
  zip: string;
  radiusMi: number;
  excludeAuctions?: boolean;
};

export type SavedWatchRecord = {
  clientId: string;
  phone: string;
  email: string;
  consentAlerts: boolean;
  consentMarketing: boolean;
  minAlertValueUsd: number | null;
  saleMode: "both" | "estate" | "auction";
  watches: SavedWatch[];
  updatedAt: string;
};

function pathFor(clientId: string): string {
  return `watches/${clientId}.json`;
}

export function savedWatchClientIdOk(clientId: string): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/.test(clientId);
}

export async function writeSavedWatches(
  record: Omit<SavedWatchRecord, "updatedAt">
): Promise<{ stored: boolean }> {
  if (!blobConfigured()) return { stored: false };
  await writeBlobJson(pathFor(record.clientId), {
    ...record,
    updatedAt: new Date().toISOString(),
  });
  return { stored: true };
}

export async function readSavedWatches(clientId: string): Promise<SavedWatchRecord | null> {
  if (!savedWatchClientIdOk(clientId)) return null;
  return readBlobJson<SavedWatchRecord>(pathFor(clientId));
}
