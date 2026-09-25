/**
 * Push local watches + profile to the server. Client-only.
 * One local watch stays one server watch; keywords are not split.
 */

import { normalizePhone } from "./phone";
import { loadProfile, loadWatches } from "./watches";

const CLIENT_KEY = "estatesnipe.clientId.v1";

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(CLIENT_KEY) || "";
  if (/^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_KEY, id);
  return id;
}

export async function pushLocalState(): Promise<void> {
  if (typeof window === "undefined") return;
  const clientId = getOrCreateClientId();
  if (!clientId) return;
  const watches = loadWatches();
  const profile = loadProfile();
  const rawMode = window.localStorage.getItem("estatesnipe.saleMode");
  const saleMode =
    rawMode === "estate" || rawMode === "auction" || rawMode === "both"
      ? rawMode
      : "both";
  try {
    await fetch("/api/watch/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        phone: normalizePhone(profile?.phone || "") || profile?.phone || "",
        email: profile?.email || "",
        consentAlerts: Boolean(profile?.consentAlerts),
        consentMarketing: Boolean(profile?.consentMarketing),
        minAlertValueUsd:
          typeof profile?.minAlertValueUsd === "number" &&
          Number.isFinite(profile.minAlertValueUsd) &&
          profile.minAlertValueUsd > 0
            ? Math.round(profile.minAlertValueUsd)
            : null,
        saleMode,
        watches: watches.map((w) => ({
          id: w.id,
          keyword: w.keyword,
          zip: w.zip,
          radiusMi: w.radiusMi,
          excludeAuctions: Boolean(w.excludeAuctions),
        })),
      }),
    });
  } catch {
    // Local watches still work if the server is unreachable.
  }
}
