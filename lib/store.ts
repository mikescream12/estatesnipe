/**
 * Seen listing IDs + match history store.
 *
 * Vercel-friendly: in-memory primary + optional JSON under /tmp.
 * Production needs a durable DB/KV (Postgres, Redis, Vercel KV, etc.).
 */

import { promises as fs } from "fs";
import path from "path";
import { blobConfigured, readBlobJson, writeBlobJson } from "./blobJson";
import type { MatchHit } from "./match";

export type StoredMatch = {
  listingId: string;
  sourceId: string;
  title: string;
  url: string;
  matchedWatch: string;
  matchedKeywords: string[];
  score: number;
  at: string;
  matchSource?: "text" | "photo" | "both";
  visionReason?: string;
};

type StoreShape = {
  seenIds: string[];
  matches: StoredMatch[];
  lastScanAt: string | null;
};

const FILE =
  process.env.ESTATESNIPE_STORE_FILE || "/tmp/estatesnipe-store.json";
const SEEN_BLOB = "meta/seen-store.json";
const MAX_SEEN = 5000;
const MAX_MATCHES = 500;

let memory: StoreShape = {
  seenIds: [],
  matches: [],
  lastScanAt: null,
};
let loaded = false;

function shapeFrom(parsed: Partial<StoreShape> | null | undefined): StoreShape {
  return {
    seenIds: Array.isArray(parsed?.seenIds) ? parsed!.seenIds : [],
    matches: Array.isArray(parsed?.matches) ? parsed!.matches : [],
    lastScanAt: parsed?.lastScanAt ?? null,
  };
}

async function load(): Promise<StoreShape> {
  if (loaded) return memory;
  if (blobConfigured()) {
    try {
      const parsed = await readBlobJson<StoreShape>(SEEN_BLOB);
      if (parsed) memory = shapeFrom(parsed);
    } catch {
      // keep the in-process snapshot if blob is briefly unreachable
    }
    loaded = true;
    return memory;
  }
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ FILE, "utf8");
    memory = shapeFrom(JSON.parse(raw) as StoreShape);
  } catch {
    // fresh store
  }
  loaded = true;
  return memory;
}

/** Force the next read to come from Blob. Used by cron before a scan. */
export async function hydrateStoreFromDurable(): Promise<void> {
  if (!blobConfigured()) return;
  loaded = false;
  await load();
}

async function persist(): Promise<void> {
  if (blobConfigured()) {
    try {
      await writeBlobJson(SEEN_BLOB, memory);
    } catch {
      // this instance still has memory; the next cold start reloads blob
    }
    return;
  }
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(FILE), { recursive: true });
    await fs.writeFile(/*turbopackIgnore: true*/ FILE, JSON.stringify(memory), "utf8");
  } catch {
    // ephemeral hosts: memory still works for the process lifetime
  }
}

export async function getStoreSnapshot(): Promise<StoreShape> {
  const s = await load();
  return {
    seenIds: [...s.seenIds],
    matches: [...s.matches],
    lastScanAt: s.lastScanAt,
  };
}

export async function isSeen(id: string): Promise<boolean> {
  const s = await load();
  return s.seenIds.includes(id);
}

export async function markSeen(ids: string[]): Promise<void> {
  const s = await load();
  const set = new Set(s.seenIds);
  for (const id of ids) set.add(id);
  s.seenIds = Array.from(set).slice(-MAX_SEEN);
  await persist();
}

export async function recordMatches(hits: MatchHit[]): Promise<StoredMatch[]> {
  const s = await load();
  const now = new Date().toISOString();
  const recorded: StoredMatch[] = [];
  for (const hit of hits) {
    const row: StoredMatch = {
      listingId: hit.listing.id,
      sourceId: hit.listing.sourceId,
      title: hit.listing.title,
      url: hit.listing.url,
      matchedWatch: hit.matchedWatch,
      matchedKeywords: hit.matchedKeywords,
      score: hit.score,
      at: now,
      matchSource: hit.matchSource,
      visionReason: hit.visionReason,
    };
    recorded.push(row);
    s.matches.unshift(row);
  }
  s.matches = s.matches.slice(0, MAX_MATCHES);
  s.lastScanAt = now;
  await persist();
  return recorded;
}

export async function touchScan(): Promise<void> {
  const s = await load();
  s.lastScanAt = new Date().toISOString();
  await persist();
}

/**
 * Filter to listings not yet seen; optionally mark them seen after.
 */
export async function filterNewIds(
  ids: string[],
  { mark = false }: { mark?: boolean } = {}
): Promise<string[]> {
  const s = await load();
  const seen = new Set(s.seenIds);
  const fresh = ids.filter((id) => !seen.has(id));
  if (mark && fresh.length) await markSeen(fresh);
  return fresh;
}
