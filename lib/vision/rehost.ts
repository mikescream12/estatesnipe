/**
 * Rehost remote listing photos as data URLs so vision providers can see them
 * when upstream CDNs block OpenAI/xAI fetchers (common: Wikimedia, some sale CDNs).
 * Never logs image bytes. Caps size; soft-fails per URL.
 */

const MAX_BYTES = 4_500_000; // ~4.5MB per image before base64
const FETCH_TIMEOUT_MS = 12_000;

function mimeFromUrlOrHeader(url: string, contentType: string | null): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  return "image/jpeg";
}

/** Already a data URL? pass through. */
export function isDataUrl(url: string): boolean {
  return /^data:image\//i.test(url.trim());
}

/**
 * Fetch one image and return a data: URL, or null on failure / non-image.
 */
export async function fetchImageAsDataUrl(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<string | null> {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (isDataUrl(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "EstateSnipeBot/0.1 (+https://estatesnipe.com; vision-rehost; respectful)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || buf.length > MAX_BYTES) return null;
    // Reject obvious HTML error pages
    const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) return null;
    const mime = mimeFromUrlOrHeader(trimmed, res.headers.get("content-type"));
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Rehost photo URLs for the vision API (order-preserving).
 * apiUrls are data: (or already-data); originalUrls align 1:1 for cache/UI.
 */
export async function rehostPhotoUrlsForVision(
  urls: string[],
  options?: { timeoutMs?: number }
): Promise<{ apiUrls: string[]; originalUrls: string[]; failed: number }> {
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const apiUrls: string[] = [];
  const originalUrls: string[] = [];
  let failed = 0;

  for (const url of urls) {
    if (isDataUrl(url)) {
      apiUrls.push(url);
      originalUrls.push(url);
      continue;
    }
    const data = await fetchImageAsDataUrl(url, timeoutMs);
    if (data) {
      apiUrls.push(data);
      originalUrls.push(url);
    } else {
      failed++;
    }
  }

  return { apiUrls, originalUrls, failed };
}
