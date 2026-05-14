# CollabStream

CollabStream is a video collaboration app for screen sharing, annotation, session history, recording, custom branding, whiteboards, webhooks, calendar scheduling, and optional OS-level remote control through the desktop companion.

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

## Quick Start

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- Signaling/API server: http://localhost:3001

Guests can join public room links without accounts. Hosts sign in so plan limits, billing, history, and business features can be enforced.

## Ngrok Phone Testing

Install and run the bundled tunnel support:

```bash
npm install
$env:NGROK_AUTHTOKEN="your-ngrok-token"
npm run tunnel
```

The tunnel script starts ngrok for the web app, writes the active URL to `apps/web/.env.local` as `VITE_PUBLIC_URL`, and updates Vite `allowedHosts` so phone QR links work. If you already have the ngrok CLI running, `npm run sync-ngrok` can sync the current tunnel from the local ngrok API.

## Environment

Copy the examples and fill in real values:

```bash
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Server env includes Supabase service role credentials, Stripe secret keys, Stripe webhook secret, R2 credentials, admin token, upload limits, CORS origins, and public URL settings. Web env includes Supabase public credentials, Stripe public price IDs, API/signaling URLs, and public QR URL.

## Supabase Database

Apply the migration in `supabase/migrations/20260514000000_monetization_schema.sql` to create:

- profiles
- sessions
- audit_events
- whiteboards
- webhooks

The migration enables RLS and adds owner policies for authenticated users. Server routes use the service role key.

## Companion App

For OS-level control:

```bash
npm run dev --workspace=apps/companion
```

The companion listens on `ws://localhost:7734`. Browser-level collaboration works without it; OS-level control becomes available when the companion is running and the host grants control.

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
- Authenticated host routes verify Supabase JWTs.
- Plan limits are enforced server-side.
- Stripe webhooks verify signatures before updating plans.
- R2 uploads are restricted by MIME type and configured size limits.
- Business webhooks require HTTPS and reject private-network targets.

## Project Structure

```text
collab-stream/
  apps/
    web/          React frontend
    server/       Node.js signaling/API server
    companion/    Tauri desktop companion
    mobile/       Expo mobile app
  scripts/        ngrok, deploy, and helper scripts
  supabase/       local Supabase config and migrations
  package.json    npm workspace root
```
