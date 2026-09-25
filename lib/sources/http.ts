import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { rateLimit } from "./rateLimit";

export const BOT_UA =
  "EstateSnipeBot/0.1 (+https://estatesnipe.com; sale-watch demo; respectful; contact via site)";

const CACHE_DIR = process.env.ESTATESNIPE_CACHE_DIR || "/tmp/estatesnipe-cache";
const memoryCache = new Map<string, { at: number; body: string; status: number; contentType: string }>();

/** Full URL hash. A truncated key collided and served another city's body. */
export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

async function readFileCache(
  key: string,
  ttlMs: number
): Promise<{ body: string; status: number; contentType: string } | null> {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
    const parsed = JSON.parse(raw) as {
      at: number;
      body: string;
      status: number;
      contentType: string;
    };
    if (Date.now() - parsed.at > ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileCache(
  key: string,
  payload: { at: number; body: string; status: number; contentType: string }
): Promise<void> {
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ CACHE_DIR, { recursive: true });
    await fs.writeFile(
      /*turbopackIgnore: true*/ path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(payload),
      "utf8"
    );
  } catch {
    // /tmp may be unavailable on some hosts — memory cache still works
  }
}

export type FetchCachedOptions = {
  ttlMs?: number;
  rateKey?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Skip cache read/write */
  noCache?: boolean;
};

export async function fetchCached(
  url: string,
  opts: FetchCachedOptions = {}
): Promise<{ body: string; status: number; contentType: string; cached: boolean }> {
  const ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  const key = cacheKey(url + (opts.body || ""));

  if (!opts.noCache) {
    const mem = memoryCache.get(key);
    if (mem && Date.now() - mem.at < ttlMs) {
      return { ...mem, cached: true };
    }
    const disk = await readFileCache(key, ttlMs);
    if (disk) {
      memoryCache.set(key, { ...disk, at: Date.now() });
      return { ...disk, cached: true };
    }
  }

  await rateLimit(opts.rateKey || "outbound", { maxRequests: 1, windowMs: 1200 });

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "User-Agent": BOT_UA,
      Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
      ...(opts.headers || {}),
    },
    body: opts.body,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const body = await res.text();
  const contentType = res.headers.get("content-type") || "";
  const payload = {
    at: Date.now(),
    body,
    status: res.status,
    contentType,
  };

  if (!opts.noCache && res.status >= 200 && res.status < 300) {
    memoryCache.set(key, payload);
    await writeFileCache(key, payload);
  }

  return { ...payload, cached: false };
}
