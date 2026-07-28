# CollabStream

CollabStream is a video collaboration app for screen sharing, annotation, session history, recording, custom branding, whiteboards, webhooks, calendar scheduling, and optional OS-level remote control through the desktop companion.

One thing worth leading with: every guest can be gated behind an approve-to-join flow — turn on "knock to join" and nobody enters your session until you tap admit, with a live request queue and one-tap kick/ban if someone slips through. Most competitors either skip this entirely or bury it behind a clunky waiting-room setting.

Built by Godstime Aburu.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, Vite, Tailwind |
| Signaling/API | Node.js, Express, ws |
| P2P | WebRTC |
| Auth and database | Supabase Auth, Supabase Postgres |
| Billing | Stripe Checkout, Customer Portal, webhooks |
| Cloud recording and logos | Cloudflare R2 |
| OS control | Tauri 2 and Rust companion |
| Package manager | npm workspaces |

## Pricing Limits

| Plan | Guests | Session length | Recording | History | Business features |
| --- | ---: | ---: | --- | --- | --- |
| Free | 3 | 45 minutes | No | No | No |
| Pro | 10 | 8 hours | Local | Yes | No |
| Business | 20 | No app limit | Cloud and local | Yes | Branding, webhooks, saved whiteboards |

## How to Run This Project

### Prerequisites

- **Node.js 18+** (LTS recommended - this repo uses Vite 5, which requires it)
- **npm** (ships with Node; this repo uses npm workspaces, not yarn/pnpm)
- **Git**

### 1. Clone and install

```bash
git clone https://github.com/<your-fork-or-org>/CollabStream.git
cd CollabStream
npm install
```

This one `npm install` at the repo root installs dependencies for every workspace
(`apps/web`, `apps/server`, `apps/companion`, `apps/mobile`) — you don't need to `cd` into
each one and install separately.

### 2. Fastest path: run it with zero configuration

You can run the whole host/guest video-calling core with **no environment variables set at
all**. `apps/server/src/supabase.js` and `apps/server/src/stripe.js` both detect missing
credentials and degrade gracefully (they log a warning and disable just the routes that need
them) instead of crashing the server. Guests never need accounts, so this is enough to test
screen sharing, annotation, chat, the waiting room, etc. end to end on `localhost`:

```bash
npm run dev
```

- Web app: **http://localhost:5173**
- Signaling/API server: **http://localhost:3001**

Open the web app, create a session as host, then open the guest link in a second tab (or a
private/incognito window, so it doesn't share the host's login state) to join as a guest.

What you'll be missing without env vars: host sign-in, plan-limit enforcement, session
history, cloud recording, Stripe billing, and business features (branding/webhooks/saved
whiteboards). Set those up in step 3 once the bare version is working.

### 3. Full setup: environment variables

Copy the example env files and fill in real values:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

(On Windows PowerShell, use `Copy-Item apps/server/.env.example apps/server/.env` and the web
equivalent instead of `cp`.)

- **`apps/server/.env`** — Supabase service role credentials, Stripe secret key + webhook
  secret + price IDs, Cloudflare R2 credentials, admin token, upload limits, CORS origins,
  public URL settings. Every value is commented in the file with what it's for.
- **`apps/web/.env.local`** — Supabase URL + public anon key, Stripe *public* price IDs only
  (never a secret key here), the server/signaling URLs, and optional TURN server config for
  guests behind strict NATs/firewalls.

You don't need to fill in every field — only the section(s) matching the feature you want
working (e.g. skip R2 entirely if you don't care about cloud recording yet).

### 4. Set up the database (only needed for auth/persistence)

CollabStream uses Supabase for auth and persistence. Create your own Supabase project, then
apply `supabase/example_schema.sql` — it's a from-scratch starter schema (tables, RLS
policies, indexes) derived from every Supabase query the server makes, meant for anyone
standing up their own instance from zero. It is **not** the maintainer's real production
schema (see `supabase/migrations/README.md`). Apply it *before* anything already in
`supabase/migrations/`, since those assume a base schema like this one already exists.

See the "Supabase Database" section further down for the one optional extra table
(`webhook_deliveries`) and what happens if you skip it.

### 5. Run it

```bash
npm run dev          # web + signaling server
npm run dev:all      # web + signaling server + desktop companion (OS-level control)
npm run dev:public   # web + signaling server + an ngrok tunnel, for testing on a phone
```

### 6. Run the tests

```bash
npm test             # server unit/integration tests + web e2e tests
npm run test:server  # just the server suite (node:test, no extra dependency)
npm run test:e2e     # just the web Playwright e2e suite
```

### 7. Build for production

```bash
npm run build             # builds apps/web
npm run build:companion   # builds the Tauri desktop companion
npm run start:server      # runs the server with `node`, not `nodemon` (no auto-reload)
```

Deployment specifics (hosting, process managers, etc.) are in `DEPLOY.md`.

## Testing on a Phone (ngrok)

Install and run the bundled tunnel support:

```bash
npm install
$env:NGROK_AUTHTOKEN="your-ngrok-token"
npm run tunnel
```

The tunnel script starts ngrok for the web app and writes the active URL plus host allow-list to `apps/web/.env.local` as `VITE_PUBLIC_URL` and `VITE_ALLOWED_HOSTS`, so phone QR links work without mutating tracked config. If you already have the ngrok CLI running, `npm run sync-ngrok` can sync the current tunnel from the local ngrok API. `npm run dev:public` (step 5 above) does this automatically alongside the web/server dev processes.

## Supabase Database

CollabStream uses Supabase for authentication and persistence, but production database
migrations and deployment runbooks are intentionally not included in this public repo.
Create your own Supabase project and schema that matches the app behavior you want to run.

**Starting from scratch?** `supabase/example_schema.sql` is a from-scratch example schema
(tables, RLS policies, indexes) derived directly from every Supabase query in
`apps/server/src/db.js` and `apps/server/src/index.js`. It's not the maintainer's real
production schema (see `supabase/migrations/README.md`) — it's a working starting point for
anyone standing up their own instance. Apply it before the files already in
`supabase/migrations/`, which assume a base schema like this one already exists.

The webhook delivery log (Settings → Webhooks → View log) reads/writes a `webhook_deliveries`
table (`webhook_id`, `host_id`, `event`, `status_code`, `ok`, `error`, `created_at`) — included
in `example_schema.sql`. This one's genuinely optional: everything else keeps working without
it, delivery logging just becomes a no-op.

Server routes must use a private service role key. Never expose the service role key,
Stripe secrets, webhook secrets, R2 secrets, or admin tokens in client code or commits.

## Companion App

For OS-level control:

```bash
npm run dev --workspace=apps/companion
```

The companion listens on `ws://localhost:7734`. Browser-level collaboration works without it; OS-level control becomes available when the companion is running and the host grants control.

**If you serve the web app from anywhere other than the local dev server** (LAN IP, ngrok,
a production domain), you must set `COLLABSTREAM_ALLOWED_ORIGINS` in the companion's
environment — see `apps/companion/README.md` for details. The companion only accepts local
connections from an allowlisted origin; this is a real security boundary, not a convenience
setting (see Security Notes below).

## Useful Commands

```bash
npm run dev
npm run dev:all
npm run build
npm run start:server
npm run tunnel
npm run sync-ngrok
```

## Security Notes

- Session and control tokens are generated per room.
- Guests each get an individually issued, individually revocable token (minted fresh per browser at join time) rather than one shared secret — kicking one guest never affects any other guest's access.
- Hosts can kick a disruptive guest, or kick-and-ban to also block their IP from getting a new token.
- Authenticated host routes verify Supabase JWTs.
- Plan limits are enforced server-side.
- Stripe checkout only accepts configured Pro/Business price IDs, redirects only back to the configured app origin, and webhooks verify signatures before updating plans.
- R2 uploads are restricted by MIME type and configured size limits.
- API responses include baseline security headers, JSON request bodies are size-limited, and sensitive routes have route-specific rate limits in addition to the global IP throttle.
- Business webhooks require HTTPS, reject private-network targets before they are saved, and pin the validated IP for delivery to close a DNS-rebinding gap.
- Business hosts can view a delivery log (status code, timestamp, error) for each configured webhook from Settings.
- Admin routes authenticate via an `Authorization: Bearer` header (never a query param), compare tokens with constant-time comparison, rate-limit attempts, and log every admin action with the requesting IP.
- WebRTC connections fall back to a TURN relay when configured (`VITE_TURN_URLS` etc. — see `apps/web/.env.example`) for guests behind symmetric NAT or strict firewalls; STUN-only works for most networks but isn't guaranteed to traverse every one.
- The companion's local remote-control relay (`ws://127.0.0.1:7734`) only accepts connections from an allowlisted `Origin`, so a malicious webpage open in any browser on the host's machine can't silently connect and arm/drive OS-level input. This does not protect against a different local process deliberately forging its Origin header — see `apps/companion/README.md` for the full threat model and what a complete fix would require.

## Project Structure

```text
collab-stream/
  apps/
    web/          React frontend
    server/       Node.js signaling/API server
    companion/    Tauri desktop companion
    mobile/       Expo mobile app
  scripts/        ngrok, deploy, and helper scripts
  supabase/       example_schema.sql (public starter schema) + local config; private migrations are not shipped
  package.json    npm workspace root
```
