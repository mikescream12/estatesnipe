# EstateSnipe (v1 product shell)

Website: https://estatesnipe.com

Mobile-first **PWA** for estate-sale sniping alerts. Collectors talk to a buyer’s assistant to set **unlimited watches** (no dropdown taxonomies). A future poller will match listings/photos and SMS/email them.

> Demo shell — watches/profile live in `localStorage`. Twilio SMS test send is wired; Stripe/scraper still mocked.

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

## Twilio SMS (test send)

Copy `.env.example` → `.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (never commit) |
| `TWILIO_PHONE_NUMBER` | From number in E.164 (e.g. `+17372583742`) |

`.env*` is gitignored — do not commit secrets.

**Trial limitation:** Twilio trial accounts can only SMS **verified** destination numbers. Add/verify your phone in the [Twilio Console](https://console.twilio.com/) → Phone Numbers → Verified Caller IDs. Unverified numbers return a clear API error.

### Try it

1. `npm run dev`
2. Open `/app/sample-alert`
3. Enter an E.164 phone (`+1…`) — prefilled from saved profile if present
4. Tap **Text me this alert** → `POST /api/sms/test` → `{ ok: true, sid }` or `{ ok: false, error }`

Or curl:

```bash
curl -s -X POST http://localhost:3000/api/sms/test \
  -H 'Content-Type: application/json' \
  -d '{"to":"+1XXXXXXXXXX"}'
```

## Demo: chat + install

1. **Chat-first filters** — On `/`, type:  
   `hen on a nest, sealed Pokemon, 40 miles, skip auctions`  
   → confirmation card → **Create these watches** → `/app` list.
2. Optional category chips are collapsed under “Optional shortcuts” (not the main UI).
3. **Install on phone** — Use the orange **Add to Home Screen** banner:
   - **iOS:** Safari → Share → Add to Home Screen  
   - **Android:** Chrome ⋮ → Install app / Add to Home screen  
   Service worker (`/sw.js`) caches a basic offline shell. HTTPS (or localhost) required for install.

## Routes

| Path | Purpose |
|------|---------|
| `/` | **Hero:** conversational watch setup + install banner + optional contact/consents |
| `/app` | Watches list, manual add/delete, Pro upgrade CTA (freemium) |
| `/app/chat` | Same chat experience (alias) |
| `/app/sample-alert` | Mock SMS card + **Text me this alert** (real Twilio) |
| `POST /api/sms/test` | Send test SMS `{ to, body? }` → `{ ok, sid }` or `{ ok: false, error }` |

## Demo vs future

| Area | v1 now | Future |
|------|--------|--------|
| Filters | Chat / rule-based parser (`lib/parseWatchIntent.ts`) | Real LLM structured extraction |
| Watches | `localStorage` | Accounts + DB |
| Alerts | **Twilio** test SMS via `/api/sms/test` | Poller-driven SMS + email |
| Matching | None | Poller + vision |
| Billing | Upgrade → `alert()` | **Stripe** Free → Pro |
| PWA | manifest, icons, apple meta, install banner, basic SW | Richer offline / push |

## PWA checklist

- `public/manifest.json` — name, icons, `display: standalone`, theme/background `#0f1115`
- Apple / mobile web app meta via `app/layout.tsx`
- Install banner: `components/InstallBanner.tsx`
- Service worker: `public/sw.js` + `ServiceWorkerRegister`

## Stack

Next.js App Router · TypeScript · Tailwind CSS v4 · Twilio
