# EstateSnipe (v1 product shell)

Website: https://estatesnipe.com

Mobile-first **PWA** for estate-sale sniping alerts. Collectors talk to a buyer’s assistant to set **unlimited watches** (no dropdown taxonomies). A poller matches listings against watches and can SMS/email them.

> Watches/profile live in `localStorage`. Twilio SMS + sale-watch scan APIs are wired. Stripe still mocked.

## Run locally

```bash
cd /workspace/salesnipe
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (phone-width viewport recommended).

```bash
npm run build && npm start
```

## Sources

| Source | Role | How we fetch |
|--------|------|----------------|
| **estatesales.net** | PRIMARY | Public JSON `GET /api/sale-details?filter=withorigin:lat_lng\|bydistance:N\|take:M&include=mainPicture,dates,topPictures`. Zip → lat/lng via `/api/postal-code-details` (Zippopotam fallback). |
| **estatesales.org** | SECONDARY | Public HTML city pages `/estate-sales/{state}/{city}` (e.g. `/estate-sales/tx/dallas`). **Not** `estatelsaes.org`. |
| **Facebook Marketplace** | BEST-EFFORT | Stub by default. Fragile / ToS-sensitive; login walls block bots. Optional `FB_MARKETPLACE_PROBE=1` tries a public URL and returns empty + reason if blocked. **Never crashes the scan.** |
| Craigslist | — | **Not supported.** |

Outbound fetches use a polite User-Agent (`EstateSnipeBot/0.1`), in-process rate limiting (~1.2s), and short TTL cache under `/tmp/estatesnipe-cache` (plus in-memory). Respect each site’s ToS; this is a demo poller, not a license to hammer them.

### Facebook limitations (honest)

- Marketplace is **not** a stable public API for third-party alert apps.
- Scraping logged-in sessions, stealing cookies, or bypassing CAPTCHA is out of scope and disallowed.
- Production options: official Meta APIs (if granted), user-authorized flows, or a manual/extension ingest — see `lib/sources/facebookMarketplace.ts` TODOs.

## Sale-watch scan

### Manual / UI

1. Create watches on `/` chat or `/app`.
2. On **`/app`**, tap **Scan now** — POSTs `/api/watch/scan` with watches + zip from `localStorage` profile.
3. Results show matches + per-source status (even when a source is empty).

### API

```bash
curl -s -X POST http://localhost:3000/api/watch/scan \
  -H 'Content-Type: application/json' \
  -d '{"zip":"75201","radiusMiles":25,"watchTexts":["sterling","mcm furniture","pokemon"]}'
```

Example response shape:

```json
{
  "ok": true,
  "zip": "75201",
  "radiusMiles": 25,
  "scannedAt": "2026-09-15T05:30:00.000Z",
  "listingCount": 42,
  "matchCount": 3,
  "newMatchCount": 2,
  "matches": [
    {
      "listing": {
        "id": "esn:5072826",
        "sourceId": "estatesales.net",
        "title": "… MCM Furniture …",
        "url": "https://www.estatesales.net/…",
        "photos": [{ "url": "https://…" }]
      },
      "matchedWatch": "mcm furniture",
      "matchedKeywords": ["MCM furniture"],
      "score": 1.15,
      "fields": ["title"],
      "isNew": true
    }
  ],
  "sources": [
    { "sourceId": "estatesales.net", "ok": true, "listingCount": 40 },
    { "sourceId": "estatesales.org", "ok": true, "listingCount": 30 },
    { "sourceId": "facebook", "ok": true, "listingCount": 0, "reason": "…" }
  ],
  "sms": { "attempted": false, "sent": false }
}
```

Status: `GET /api/watch/status` — seen IDs + recent matches (in-memory + `/tmp` JSON; **production needs DB/KV**).

### Cron (Vercel)

`vercel.json` schedules **every 15 minutes** → `GET /api/watch/cron`.

- Requires `Authorization: Bearer ${CRON_SECRET}`.
- Configure `CRON_ZIP`, `CRON_RADIUS_MILES`, `CRON_WATCH_TEXTS` (pipe-separated), optional `CRON_NOTIFY_PHONE`.
- Vercel Cron sends the `Authorization` header automatically when `CRON_SECRET` is set in the project.

```bash
curl -s http://localhost:3000/api/watch/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

> On Hobby plans, cron minimum interval may be limited by Vercel — if 15‑minute crons are rejected at deploy time, keep the entry in `vercel.json` or switch to an external scheduler hitting the same route.

## Twilio SMS (test send + match notify)

Copy `.env.example` → `.env.local` (never commit `.env.local`):

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | From number in E.164 |
| `TWILIO_ALLOW_CUSTOM_BODY` | Set `1` post-upgrade for free-text match SMS |
| `CRON_SECRET` | Bearer token for `/api/watch/cron` |

**Trial limitation:** destination numbers must be verified; Body must be a template name (`sms_event_notifications`) until upgraded.

- Sample UI: `/app/sample-alert` → `POST /api/sms/test`
- Scan notify: pass `notifyPhone` on `/api/watch/scan` or set `CRON_NOTIFY_PHONE` (sends only on **new** matches)

## Demo: chat + install

1. **Chat-first filters** — On `/`, type:  
   `hen on a nest, sealed Pokemon, 40 miles, skip auctions`  
   → confirmation card → **Create these watches** → `/app` list.
2. **Scan now** on `/app` against live sources.
3. **Install on phone** — orange **Add to Home Screen** banner (HTTPS or localhost).

## Routes

| Path | Purpose |
|------|---------|
| `/` | Conversational watch setup + install banner |
| `/app` | Watches list + **Scan now** |
| `/app/chat` | Chat alias |
| `/app/sample-alert` | Mock SMS card + Twilio test send |
| `POST /api/watch/scan` | One scan cycle `{ zip, radiusMiles?, watchTexts }` |
| `GET /api/watch/cron` | Scheduled scan (Bearer `CRON_SECRET`) |
| `GET /api/watch/status` | Seen/match store snapshot |
| `POST /api/sms/test` | Test SMS |

## Stack

Next.js App Router · TypeScript · Tailwind CSS v4 · Twilio · file/`/tmp` store (swap for KV/DB in prod)
