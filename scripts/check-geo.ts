/**
 * Local geo-gate checks (no network).
 * Run: npx tsx scripts/check-geo.ts
 *
 * Proves 92886 + a Texas sale cannot match, and the same gate is not
 * hardcoded to 92886 (78701 / 10001 drop California).
 */
import { cacheKey } from "../lib/sources/http";
import {
  haversineMiles,
  roundMiles,
  softMaxMiles,
} from "../lib/sources/geo";
import { classifyDistanceMiles, decideGeoBand } from "../lib/geoFilter";
import {
  clampRadiusMiles,
  gateListing,
  preferredZip,
  stateForZip,
} from "../lib/geoPure";

const yorba = {
  zip: "92886",
  latitude: 33.8885,
  longitude: -117.8134,
  city: "Yorba Linda",
  state: "ca",
};

const austin = {
  zip: "78701",
  latitude: 30.2672,
  longitude: -97.7431,
  city: "Austin",
  state: "tx",
};

const nyc = {
  zip: "10001",
  latitude: 40.7506,
  longitude: -73.9971,
  city: "New York",
  state: "ny",
};

const houston = { lat: 29.7604, lng: -95.3698 };

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok  ${msg}`);
}

const houstonMi = roundMiles(
  haversineMiles(yorba.latitude, yorba.longitude, houston.lat, houston.lng)
);
assert(houstonMi > 1000, `Houston ~${houstonMi} mi from 92886 (must be >> 25)`);

assert(stateForZip("92886") === "ca", "92886 is California");
assert(stateForZip("77002") === "tx", "77002 is Texas");
assert(stateForZip("75201") === "tx", "75201 Dallas is Texas");
assert(stateForZip("78701") === "tx", "78701 Austin is Texas");
assert(stateForZip("10001") === "ny", "10001 is New York");

const far = decideGeoBand({
  distanceMiles: houstonMi,
  listingState: "TX",
  listingZip: "77002",
  listingCity: "Houston",
  listingUrl: "https://estatesales.org/estate-sales/tx/houston/77002/sale-1",
  origin: yorba,
  radiusMi: 25,
});
assert(!far.include && far.band === "out", "Houston-class distance excluded");

const forged = gateListing({
  origin: yorba,
  radiusMi: 25,
  coordDistanceMiles: 5,
  listingState: "TX",
  listingZip: "77002",
  listingUrl: "https://www.estatesales.net/TX/Houston/77002/999",
});
assert(!forged.include, "Forged 5 mi distance cannot hard-match Houston");

const echoedZip = gateListing({
  origin: yorba,
  radiusMi: 25,
  coordDistanceMiles: null,
  listingState: "TX",
  listingZip: "92886",
  listingUrl: "https://estatesales.org/estate-sales/tx/houston/77002/sale-2",
});
assert(
  !echoedZip.include,
  "Zip-string equality with 92886 does not hard-match a Texas sale"
);

const titleOnly = gateListing({
  origin: yorba,
  radiusMi: 25,
  coordDistanceMiles: null,
  listingState: null,
  listingZip: null,
  listingUrl: null,
});
assert(!titleOnly.include, "No structured location (title zip ignored) is out");

const urlLeak = gateListing({
  origin: yorba,
  radiusMi: 25,
  coordDistanceMiles: 4,
  listingState: "CA",
  listingZip: "92886",
  listingUrl: "https://estatesales.org/estate-sales/tx/houston/77002/open-me",
});
assert(!urlLeak.include, "Open link to a Texas sale page is excluded");

const searchLink = gateListing({
  origin: yorba,
  radiusMi: 25,
  coordDistanceMiles: 3,
  listingState: "CA",
  listingZip: "92886",
  listingUrl: "https://www.estatesales.net/search?zip=77002",
});
assert(!searchLink.include, "Search URL with a Texas zip is excluded");

const conflict = decideGeoBand({
  distanceMiles: null,
  listingState: "TX",
  listingZip: "77002",
  listingCity: "Houston",
  origin: yorba,
  radiusMi: 25,
});
assert(!conflict.include, "Unknown distance + TX vs CA conflict excluded");

assert(softMaxMiles(25) === 31.25, `softMax(25)=${softMaxMiles(25)}`);
assert(classifyDistanceMiles(25, 25) === "in", "25mi with 25mi radius is in");
assert(classifyDistanceMiles(30, 25) === "near", "30mi with 25mi radius is near-miss");
assert(classifyDistanceMiles(31.25, 25) === "near", "31.25mi is still near-miss");
assert(classifyDistanceMiles(31.3, 25) === "out", "31.3mi beyond softMax excluded");
assert(clampRadiusMiles(0, 25) === 25, "radius 0 is not unlimited");
assert(clampRadiusMiles(5000, 25) === 100, "huge radius caps at 100");
assert(
  classifyDistanceMiles(houstonMi, 5000) === "out",
  "even a huge requested radius cannot include Houston"
);

const near = decideGeoBand({
  distanceMiles: 30,
  listingState: "CA",
  listingZip: "92821",
  origin: yorba,
  radiusMi: 25,
});
assert(
  near.include && near.outsideRadius && near.band === "near",
  "30mi flagged outsideRadius / near"
);

const inside = decideGeoBand({
  distanceMiles: 8.2,
  listingState: "CA",
  listingZip: "92886",
  listingUrl: "https://www.estatesales.net/CA/Yorba-Linda/92886/123",
  origin: yorba,
  radiusMi: 25,
});
assert(
  inside.include && !inside.outsideRadius && inside.band === "in",
  "in-radius stays a hard match"
);

const unknownFarZip = decideGeoBand({
  distanceMiles: null,
  listingState: "CA",
  listingZip: "94102",
  listingCity: "San Francisco",
  origin: yorba,
  radiusMi: 25,
});
assert(!unknownFarZip.include, "Unknown distance excluded (not worldwide)");

const caFromAustin = gateListing({
  origin: austin,
  radiusMi: 25,
  coordDistanceMiles: 2,
  listingState: "CA",
  listingZip: "92886",
  listingUrl: "https://estatesales.org/estate-sales/ca/yorba-linda/92886/x",
});
assert(!caFromAustin.include, "78701 does not keep a California sale");

const caFromNyc = gateListing({
  origin: nyc,
  radiusMi: 50,
  coordDistanceMiles: 1,
  listingState: "CA",
  listingZip: "90210",
});
assert(!caFromNyc.include, "10001 does not keep a California sale");

const localAustin = gateListing({
  origin: austin,
  radiusMi: 25,
  coordDistanceMiles: 6,
  listingState: "TX",
  listingZip: "78704",
  listingUrl: "https://www.estatesales.net/TX/Austin/78704/55",
});
assert(localAustin.include && !localAustin.outsideRadius, "Austin keeps a nearby Texas sale");

assert(preferredZip("92886", "77002") === "92886", "zip field beats a Texas zip in the query");
assert(preferredZip("", "77002") === "77002", "empty field may use an explicit query zip");
assert(preferredZip("", null) === "", "no zip stays empty — never a Dallas default");

const a = cacheKey(
  "https://www.estatesales.net/api/postal-code-details?filter=byfield:postalcodenumber_92886"
);
const b = cacheKey(
  "https://www.estatesales.net/api/postal-code-details?filter=byfield:postalcodenumber_77002"
);
assert(a !== b && a.length === 64, "geocode cache keys do not collide across zips");

console.log("\nAll geo checks passed. softMax = max(radius*1.25, radius+5).");
