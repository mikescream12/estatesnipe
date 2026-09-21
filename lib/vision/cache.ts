/**
 * Vision result cache: in-memory + optional filesystem under /tmp
 * (or ESTATESNIPE_VISION_CACHE_DIR). Keyed by hash(intent + sorted photo urls).
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { VisionMatchResult } from "./types";

const CACHE_DIR =
  process.env.ESTATESNIPE_VISION_CACHE_DIR || "/tmp/estatesnipe-vision-cache";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h — photos/intent stable within a scan day

type CacheEntry = {
  at: number;
  result: VisionMatchResult;
};

const memory = new Map<string, CacheEntry>();

export function visionCacheKey(intent: string, photoUrls: string[]): string {
  const normalizedIntent = intent.trim().toLowerCase().replace(/\s+/g, " ");
  const urls = [...photoUrls].map((u) => u.trim()).filter(Boolean).sort();
  const payload = JSON.stringify({ intent: normalizedIntent, urls });
  return createHash("sha256").update(payload).digest("hex");
}

function ttlMs(): number {
  const raw = process.env.ESTATESNIPE_VISION_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

async function readDisk(key: string): Promise<CacheEntry | null> {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.result || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > ttlMs()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDisk(key: string, entry: CacheEntry): Promise<void> {
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ CACHE_DIR, { recursive: true });
    await fs.writeFile(
      /*turbopackIgnore: true*/ path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(entry),
      "utf8"
    );
  } catch {
    // ephemeral hosts: memory still works
  }
}

export async function getCachedVision(
  intent: string,
  photoUrls: string[]
): Promise<VisionMatchResult | null> {
  const key = visionCacheKey(intent, photoUrls);
  const mem = memory.get(key);
  if (mem && Date.now() - mem.at <= ttlMs()) {
    return { ...mem.result, cached: true };
  }
  const disk = await readDisk(key);
  if (disk) {
    memory.set(key, disk);
    return { ...disk.result, cached: true };
  }
  return null;
}

export async function setCachedVision(
  intent: string,
  photoUrls: string[],
  result: VisionMatchResult
): Promise<void> {
  // Don't cache hard failures that might be transient (timeouts / 429)
  if (result.error && /timeout|429|rate|ECONN|fetch failed/i.test(result.error)) {
    return;
  }
  const key = visionCacheKey(intent, photoUrls);
  const entry: CacheEntry = {
    at: Date.now(),
    result: { ...result, cached: undefined },
  };
  memory.set(key, entry);
  await writeDisk(key, entry);
}

/** Test helper */
export function clearVisionMemoryCache(): void {
  memory.clear();
}
