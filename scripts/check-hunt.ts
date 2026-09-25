/**
 * Hunt conversation checks (no network).
 * Run: npx tsx scripts/check-hunt.ts
 *
 * The old parser treated "widen it" as a keyword and never changed miles.
 * These checks lock the follow-up behavior the chat now uses.
 */
import assert from "node:assert/strict";
import { parseWatchIntent } from "../lib/parseWatchIntent";
import {
  applyHuntTurn,
  emptyHuntQuery,
  extractItemKeywords,
  type HuntQuery,
} from "../lib/huntTurn";
import { huntResultMessage } from "../lib/huntReply";
import { executeHuntScan, type HuntPostResult } from "../lib/huntScan";
import { resolveScanRadius } from "../lib/plans";
import { classifyListingDate, dateWindowFromText } from "../lib/saleWindow";
import { matchListings } from "../lib/match";
import type { SaleListing } from "../lib/sources/types";

const NOW = new Date(2026, 8, 25, 15, 0, 0); // Friday

function turn(prev: HuntQuery, text: string) {
  return applyHuntTurn(prev, text, "en", NOW);
}

let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log("ok", name);
  } catch (err) {
    failed += 1;
    console.error("FAIL", name);
    console.error(err);
  }
}

async function main() {
await check("old parser ignores widen and invents keywords", () => {
  const widen = parseWatchIntent("widen it");
  assert.equal(widen.radiusMi, null);
  assert.ok(widen.keywords.some((k) => k.includes("widen")));

  const miles = parseWatchIntent("do 50 miles like i asked before");
  assert.equal(miles.radiusMi, 50);
  assert.ok(
    miles.keywords.some((k) => /do|like|asked|before/.test(k)),
    `expected junk keywords, got ${miles.keywords.join("|")}`
  );
});

await check("follow-ups keep keywords and apply 50 miles", () => {
  const first = turn(
    emptyHuntQuery(),
    "Find furniture within 10 miles of 92886"
  );
  assert.equal(first.action, "search");
  assert.deepEqual(first.query.keywords, ["furniture"]);
  assert.equal(first.query.radiusMi, 10);
  assert.equal(first.query.zip, "92886");

  const widened = turn(first.query, "widen it");
  assert.equal(widened.action, "search");
  assert.deepEqual(widened.query.keywords, ["furniture"]);
  assert.equal(widened.query.radiusMi, 50);
  assert.equal(widened.query.zip, "92886");

  const explicit = turn(first.query, "do 50 miles like i asked before");
  assert.equal(explicit.action, "search");
  assert.deepEqual(explicit.query.keywords, ["furniture"]);
  assert.equal(explicit.query.radiusMi, 50);
  assert.equal(explicit.query.zip, "92886");

  const again = turn(widened.query, "try again");
  assert.equal(again.action, "search");
  assert.deepEqual(again.query.keywords, ["furniture"]);
  assert.equal(again.query.radiusMi, 50);
});

await check("screenshot complaints do not replace the hunt", () => {
  const base = emptyHuntQuery({
    zip: "92886",
    radiusMi: 25,
    keywords: ["furniture"],
  });
  for (const line of [
    "wtf are you talking about its 100% avail",
    "i found 2 of them what are you looking at",
    "bro what is wrong with you im going to fix your dumbass",
  ]) {
    const next = turn(base, line);
    assert.equal(next.action, "search", line);
    assert.deepEqual(next.query.keywords, ["furniture"], line);
    assert.equal(next.query.zip, "92886", line);
    assert.equal(extractItemKeywords(line).length, 0, line);
  }
});

await check("keyword and zip changes stick", () => {
  const base = emptyHuntQuery({
    zip: "92886",
    radiusMi: 25,
    keywords: ["furniture"],
  });
  const instead = turn(base, "look for tools instead");
  assert.deepEqual(instead.query.keywords, ["tools"]);

  const also = turn(base, "also jewelry");
  assert.deepEqual(also.query.keywords, ["furniture", "jewelry"]);

  const moved = turn(base, "near 75201");
  assert.equal(moved.query.zip, "75201");
  assert.deepEqual(moved.query.keywords, ["furniture"]);
});

await check("weekend window is kept on a later widen", () => {
  const first = turn(
    emptyHuntQuery(),
    "All sales this weekend near 92886"
  );
  assert.equal(first.action, "search");
  assert.equal(first.query.browseAll, true);
  assert.equal(first.query.whenLabel, "this weekend");
  assert.ok(first.query.dateFrom && first.query.dateTo);
  const window = dateWindowFromText("this weekend", NOW);
  assert.equal(window?.label, "this weekend");
  assert.equal(new Date(window!.from).getDay(), 5);

  const widened = turn(first.query, "widen it");
  assert.equal(widened.query.browseAll, true);
  assert.equal(widened.query.whenLabel, "this weekend");
  assert.equal(widened.query.radiusMi, 50);
});

await check("asks instead of scanning when zip or items are missing", () => {
  const noZip = turn(emptyHuntQuery(), "find sterling");
  assert.equal(noZip.action, "ask");
  assert.match(noZip.ask || "", /zip/i);

  const noItem = turn(emptyHuntQuery({ zip: "92886" }), "widen it");
  assert.equal(noItem.action, "ask");
  assert.equal(noItem.query.radiusMi, 50);
  assert.match(noItem.ask || "", /look for/i);
});

await check("reply names the search and the real counts", () => {
  const query = emptyHuntQuery({
    zip: "92886",
    radiusMi: 50,
    keywords: ["furniture"],
  });
  const hits = huntResultMessage(query, {
    ok: true,
    zip: "92886",
    radiusMiles: 50,
    listingCount: 12,
    matchCount: 3,
  });
  assert.match(hits, /furniture within 50 miles of 92886/);
  assert.match(hits, /Found 3 sales/);

  const areaOnly = huntResultMessage(query, {
    ok: true,
    zip: "92886",
    radiusMiles: 50,
    listingCount: 91,
    matchCount: 0,
    sources: [
      { sourceId: "estatesales.net", ok: true, listingCount: 77 },
      {
        sourceId: "estatesales.org",
        ok: false,
        reason: "Source timed out after 14000ms",
      },
    ],
  });
  assert.match(areaOnly, /No titles mention furniture/);
  assert.match(areaOnly, /91 sales/);
  assert.match(areaOnly, /EstateSales.org/);
  assert.doesNotMatch(areaOnly, /Quiet out there|Scan failed/);

  const down = huntResultMessage(query, {
    ok: false,
    httpStatus: 504,
    error: "no answer after 42 seconds",
  });
  assert.match(down, /couldn’t finish the scan/i);
  assert.match(down, /42 seconds/);
});

await check("a failed scan is retried once", async () => {
  const calls: number[] = [];
  const post = async (
    body: Record<string, unknown>
  ): Promise<HuntPostResult> => {
    calls.push(Number(body.deadlineMs));
    if (calls.length === 1) {
      return { status: 504, data: null, errorText: "no answer after 42 seconds" };
    }
    return {
      status: 200,
      data: {
        ok: true,
        zip: "92886",
        radiusMiles: 50,
        listingCount: 4,
        matchCount: 2,
        matches: [
          {
            listing: {
              id: "esn:1",
              title: "Furniture estate sale",
              url: "https://www.estatesales.net/CA/Yorba-Linda/92886/1",
              sourceId: "estatesales.net",
              distanceMiles: 4,
            },
            matchedKeywords: ["furniture"],
          },
        ],
      },
    };
  };
  const outcome = await executeHuntScan(
    emptyHuntQuery({ zip: "92886", radiusMi: 50, keywords: ["furniture"] }),
    post
  );
  assert.deepEqual(calls, [35000, 22000]);
  assert.match(outcome.text, /first pass failed/i);
  assert.match(outcome.text, /Found 2 sales/);
  assert.equal(outcome.matches.length, 1);
  assert.equal(outcome.radiusMiles, 50);
});

await check("free cap stays for cron and lifts for an explicit hunt", () => {
  const billing = { enforced: true, pro: false };
  const capped = resolveScanRadius(50, billing, true, false);
  assert.equal(capped.radiusMiles, 25);
  assert.equal(capped.radiusCapped, true);
  assert.equal(capped.honoredPastFreeCap, false);

  const honored = resolveScanRadius(50, billing, true, true);
  assert.equal(honored.radiusMiles, 50);
  assert.equal(honored.radiusCapped, false);
  assert.equal(honored.honoredPastFreeCap, true);
});

await check("date filter drops sales outside the window and keeps undated", () => {
  const window = { from: NOW.toISOString(), to: new Date(2026, 8, 27, 23, 59, 59).toISOString() };
  assert.equal(
    classifyListingDate(
      { startDate: "2026-09-26T15:00:00.000Z", endDate: "2026-09-26T23:00:00.000Z" },
      window
    ),
    "in"
  );
  assert.equal(
    classifyListingDate(
      { startDate: "2026-10-10T15:00:00.000Z", endDate: "2026-10-10T23:00:00.000Z" },
      window
    ),
    "out"
  );
  assert.equal(classifyListingDate({ startDate: null, endDate: null }, window), "undated");
});

await check("browse-all watch matches every listing", () => {
  const listing = {
    id: "esn:9",
    sourceId: "estatesales.net",
    title: "Quiet house cleanout",
    description: "",
    url: "https://www.estatesales.net/CA/Yorba-Linda/92886/9",
    photos: [],
    fetchedAt: NOW.toISOString(),
    isAuction: false,
  } as SaleListing;
  const hits = matchListings([listing], [{ text: "*" }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].matchedKeywords[0], "anything");
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll hunt checks passed.");
}

main();
