/**
 * Simple in-process rate limiter for outbound fetches.
 * Keeps demos respectful; production should use a shared store/KV.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export async function rateLimit(
  key: string,
  {
    maxRequests = 1,
    windowMs = 1500,
  }: { maxRequests?: number; windowMs?: number } = {}
): Promise<void> {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= maxRequests) {
    const wait = windowMs - (now - bucket.timestamps[0]);
    await new Promise((r) => setTimeout(r, Math.max(wait, 50)));
    return rateLimit(key, { maxRequests, windowMs });
  }
  bucket.timestamps.push(Date.now());
}
