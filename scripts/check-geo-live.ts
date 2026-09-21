/**
 * Live regression: vintage Christmas @ 92886 has zero Texas zips,
 * and 78701 does not leak California. Requires network.
 * Run: npx tsx scripts/check-geo-live.ts
 */
import { fetchAllSources } from "../lib/sources";
import { filterListingsByWatchGeo, softMaxMiles } from "../lib/geoFilter";
import { matchListings } from "../lib/match";
import { stateForZip } from "../lib/geoPure";
import { parseUrlLocation } from "../lib/geoPure";

const TX = new Set(["tx"]);
const CA = new Set(["ca"]);

function placeStates(listing: {
  state?: string | null;
  zip?: string | null;
  url?: string;
}): string[] {
  const url = parseUrlLocation(listing.url);
  const out = [
    (listing.state || "").trim().toLowerCase().slice(0, 2),
    stateForZip(listing.zip) || "",
    (url.state || "").toLowerCase(),
    stateForZip(url.zip) || "",
  ].filter(Boolean);
  return out;
}

async function check(zip: string, query: string, banned: Set<string>, label: string) {
  const radius = 25;
  const fetchRadius = Math.min(100, Math.ceil(softMaxMiles(radius)));
  const { listings, statuses } = await fetchAllSources({
    zip,
    radiusMiles: fetchRadius,
    hardRadiusMiles: radius,
    limit: 40,
  });
  console.log(
    `\n== ${label} zip=${zip} q=${query} kept=${listings.length} soft=${softMaxMiles(radius)} ==`
  );
  console.log(
    statuses.map((s) => `${s.sourceId}:${s.listingCount}${s.ok ? "" : " FAIL " + (s.reason || "")}`).join(" | ")
  );
  const again = await filterListingsByWatchGeo(listings, zip, radius);
  const rows = again.length ? again.map((g) => g.listing) : listings;
  const bad: string[] = [];
  for (const l of rows) {
    const states = placeStates(l);
    const dist = l.distanceMiles;
    const hit = states.some((st) => banned.has(st));
    if (hit || (typeof dist === "number" && dist > softMaxMiles(radius) + 0.05)) {
      bad.push(
        `${l.sourceId} ${l.city} ${l.state} ${l.zip} ${dist}mi ${l.url}`
      );
    }
  }
  const matches = matchListings(rows, [{ text: query }]);
  console.log(`matches ${matches.length}`);
  for (const h of matches) {
    const l = h.listing;
    console.log(
      `  ${l.city || "?"} ${l.state || "?"} ${l.zip || "?"} ${l.distanceMiles ?? "?"}mi | ${l.title.slice(0, 70)}`
    );
    console.log(`  ${l.url}`);
    const states = placeStates(l);
    if (states.some((st) => banned.has(st))) {
      bad.push(`MATCH ${l.url}`);
    }
  }
  if (bad.length) {
    console.error("LEAKS:\n" + bad.join("\n"));
    throw new Error(`${label} leaked ${bad.length} far sales`);
  }
  console.log(`ok  no banned states (${[...banned].join(",")}) within results`);
}

async function main() {
  await check("92886", "vintage Christmas", TX, "yorba-linda");
  await check("78701", "vintage Christmas", CA, "austin");
  console.log("\nLive geo regression passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
