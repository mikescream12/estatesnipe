/**
 * BEST-EFFORT Facebook Marketplace source — intentionally modular & fragile.
 *
 * Facebook aggressively blocks scrapers (login walls, ToS). This module:
 * - Never crashes the scan pipeline
 * - Returns empty listings + a clear status.reason when blocked/unimplemented
 *
 * TODO options (pick one for production):
 * 1. Official Meta Marketing / Commerce APIs if/when access is granted
 * 2. User-authorized Graph API with Marketplace permissions (rare)
 * 3. Manual paste / browser extension that POSTs listings into EstateSnipe
 * 4. Third-party compliant data partner — do NOT scrape logged-in sessions
 *
 * Do NOT: steal cookies, drive signed-in browser sessions, or bypass CAPTCHA.
 */

import type {
  SaleListing,
  SaleSource,
  SourceFetchParams,
  SourceFetchResult,
} from "./types";

export const facebookMarketplace: SaleSource = {
  id: "facebook",

  async fetch(params: SourceFetchParams): Promise<SourceFetchResult> {
    const started = Date.now();
    const listings: SaleListing[] = [];

    // Optional: attempt a public keyword search URL probe — expect failure.
    // Kept behind env flag so default scans stay clean & ToS-safe.
    if (process.env.FB_MARKETPLACE_PROBE === "1" && params.latitude != null) {
      try {
        const q = encodeURIComponent("estate sale");
        const url =
          `https://www.facebook.com/marketplace/${params.zip}/search/?query=${q}` +
          `&radius=${Math.round((params.radiusMiles || 25) * 1609)}`;
        // Soft probe — any non-JSON / login wall → empty
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "EstateSnipeBot/0.1 (+https://estatesnipe.com; best-effort probe)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(8_000),
          redirect: "manual",
        });
        if (res.status !== 200) {
          return {
            listings,
            status: {
              sourceId: this.id,
              ok: false,
              listingCount: 0,
              reason: `Facebook probe HTTP ${res.status} (login/block wall — expected)`,
              durationMs: Date.now() - started,
            },
          };
        }
        // Even 200 HTML is usually a shell without listing JSON for bots.
        return {
          listings,
          status: {
            sourceId: this.id,
            ok: false,
            listingCount: 0,
            reason:
              "Facebook returned HTML shell without parseable public listings (fragile)",
            durationMs: Date.now() - started,
          },
        };
      } catch (err) {
        return {
          listings,
          status: {
            sourceId: this.id,
            ok: false,
            listingCount: 0,
            reason:
              err instanceof Error
                ? `Facebook probe failed: ${err.message}`
                : "Facebook probe failed",
            durationMs: Date.now() - started,
          },
        };
      }
    }

    return {
      listings,
      status: {
        sourceId: this.id,
        ok: true,
        listingCount: 0,
        reason:
          "Facebook Marketplace stub — not scraped by default (ToS / login walls). Set FB_MARKETPLACE_PROBE=1 to attempt a public probe, or wire an official API later.",
        durationMs: Date.now() - started,
      },
    };
  },
};
