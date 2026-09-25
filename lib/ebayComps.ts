/** True when an eBay app id is configured. Comps are not invented without it. */
export function ebayConfigured(): boolean {
  return Boolean(
    (process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || "").trim()
  );
}
