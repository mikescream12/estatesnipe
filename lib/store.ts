/**
 * Seen listing IDs + match history store.
 *
 * Vercel-friendly: in-memory primary + optional JSON under /tmp.
 * Production needs a durable DB/KV (Postgres, Redis, Vercel KV, etc.).
 */

import { promises as fs } from "fs";
import path from "path";
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
};

type StoreShape = {
  seenIds: string[];
  matches: StoredMatch[];
  lastScanAt: string | null;
};

const FILE =
  process.env.ESTATESNIPE_STORE_FILE || "/tmp/estatesnipe-store.json";
const MAX_SEEN = 5000;
const MAX_MATCHES = 500;

let memory: StoreShape = {
  seenIds: [],
  matches: [],
  lastScanAt: null,
};
let loaded = false;

async function load(): Promise<StoreShape> {
  if (loaded) return memory;
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    memory = {
      seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      lastScanAt: parsed.lastScanAt ?? null,
    };
  } catch {
    // fresh store
  }
  loaded = true;
  return memory;
}

async function persist(): Promise<void> {
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
