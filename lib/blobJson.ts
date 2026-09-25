import { del, get, list, put } from "@vercel/blob";

/** True when the production Blob token is present. Memory/disk are not used as a store. */
export function blobConfigured(): boolean {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || "").trim());
}

export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  if (!blobConfigured()) return null;
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : "";
    if (name === "BlobNotFoundError" || /not found/i.test(msg) || /\b404\b/.test(msg)) {
      return null;
    }
    throw err;
  }
}

export async function writeBlobJson(pathname: string, value: unknown): Promise<void> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }
  await put(pathname, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (!blobConfigured()) return;
  try {
    await del(pathname);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : "";
    if (name === "BlobNotFoundError" || /not found/i.test(msg) || /\b404\b/.test(msg)) {
      return;
    }
    throw err;
  }
}

export async function listBlobPathnames(prefix: string): Promise<string[]> {
  if (!blobConfigured()) return [];
  const pathnames: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await list({ prefix, cursor, limit: 200 });
    for (const blob of result.blobs) pathnames.push(blob.pathname);
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }
  return pathnames;
}
