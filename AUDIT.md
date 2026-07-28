# CollabStream — Full Audit

*This project is significantly better engineered than a first-pass skim suggests — real SSRF protection on webhooks, real Stripe signature verification, real rate limiting, a genuine room state machine with approval/knock flows. But there is one serious, concrete authorization bug (§1) that undermines the whole session-security model, and it needs to be the first thing fixed.*

---

## 1. Critical: the guest join code and the host control token are the same secret

This is the headline finding, found by reading `apps/server/src/index.js` and `rooms.js` closely, not visible from the README alone.

`POST /session` (session creation) generates **one single `token`** per room (`tokenid()`, 32 random chars) alongside a separate `joinCode` and 6-digit `shortCode`. The `token` is meant to be the *host's* private control secret — it's what `verifyToken()` checks before allowing `session/:id/lock`, `session/:id/cap`, `session/:id/audit`, and it's also what both host *and* guest WebSocket clients must present in their `register` message to `relay.js` before being let into the room at all.

The problem: `GET /api/join/:code` and `GET /join/:code` — the endpoints a **guest** hits after typing in the public join code or 6-digit short code — respond with:
```js
res.json({ sessionId: room.sessionId, token: room.token, locked: room.locked, joinCode: room.joinCode, shortCode: room.shortCode, joinMode: room.joinMode, ... })
```
**They return the full host token to anyone who supplies the guest join code.** There is no separate, lower-privilege guest token. So:

- Anyone with the public join link (which is, by design, meant to be shareable with unauthenticated guests per the README — "Guests can join public room links without accounts") can retrieve the host's control token from `/api/join/:code`.
- With that token, they can call `POST /session/:id/lock` (lock/unlock the room), `PATCH /session/:id/cap` (change the guest cap), and `GET /session/:id/audit` (read the full audit log, pro-plan-gated feature) — none of which should be available to a guest, all of which are meant to be host-only per the code's own comments (`// verifyToken` guards described as host checks throughout `index.js`).
- The 6-digit `shortCode` (`Math.floor(100000 + Math.random() * 900000)`, i.e. one of 900,000 values, generated with `Math.random()` — not a CSPRNG) is explicitly designed for easy manual entry (phone-friendly per the README's "Ngrok Phone Testing" section), which means it's also the easiest of the three identifiers to brute-force. The existing IP-based rate limit (120 req/60s per `RATE_LIMIT_MAX`) slows this down but doesn't stop it — a distributed attempt (or just patience: 900,000 codes ÷ 120/min ≈ 125 hours from a single IP, far less with a handful of IPs) can enumerate active short codes and, per the bug above, walk away with host tokens for any active session it finds.

**This is a real, exploitable privilege-escalation path from "guest with a join link" to "full host control of the room," and it needs a fix before this handles anyone's real session.**

**Fix:** issue two distinct tokens per room at creation — a `hostToken` (returned only to the creator in the `POST /session` response) and a `guestToken`/`joinToken` (a separate, lower-privilege secret returned by `/api/join/:code`, valid only for the WebSocket `register` handshake as a guest, and explicitly rejected by every `verifyToken()` call that currently gates host-only REST endpoints). `verifyToken()` and the WS `register` handler in `relay.js` both need a `role` parameter so a guest token can never satisfy a host-only check, and vice versa. This is a moderate refactor (touches `rooms.js`, `relay.js`, and every route in `index.js` that calls `verifyToken`), but it's the single most important fix in this codebase.

---

## 2. Other cracks, in descending order of severity

### 2.1 — Room state is entirely in-memory (`const rooms = new Map()` in `rooms.js`)
No persistence, no shared state across processes. Two concrete consequences:
- **Can't horizontally scale the signaling server.** If you ever run more than one instance behind a load balancer, a host and guest routed to different instances simply can't find each other — WebRTC signaling would silently fail. There's no Redis/pub-sub layer coordinating rooms across instances, so today this server is a single point of failure and a scaling ceiling.
- **A server restart drops every active session with no recovery.** A deploy, crash, or routine restart mid-meeting disconnects everyone with no reconnect/resume path — the client would need to detect the drop and prompt a full rejoin, and any admitted-guest / approval state, guest cap changes, etc. are all gone. Worth checking whether the web client actually handles this gracefully today (auto-reconnect + rejoin flow) or just shows a dead connection.

### 2.2 — `getPeer(sessionId, role)` has a confusing, backwards-reading signature
```js
function getPeer(sessionId, role) {
  const room = rooms.get(sessionId)
  if (!room) return null
  return role === 'host' ? null : room.host
}
```
Calling `getPeer(sessionId, 'host')` returns `null`. Calling `getPeer(sessionId, 'guest')` returns the **host's** websocket. Every call site in `relay.js` and `index.js` is currently consistent with this (they always pass `'guest'` when they want the host), so it's not *currently* causing a live bug — but it's a landmine: the natural reading of `getPeer(sessionId, 'host')` is "give me the host," and it silently returns `null` instead, which the next person to touch this file (including future-you) is very likely to get wrong, probably in a way that fails silently (host never gets notified of something) rather than loudly. **Rename this function** (e.g., `getHostSocket(sessionId)`, no role param needed since it only ever returns the host) — it costs nothing and removes a real footgun.

### 2.3 — No test coverage anywhere in `apps/server`
Despite this being, by far, the most security- and money-sensitive code in the project (session tokens, Stripe billing, room admission), there is no `test/`, `*.test.js`, or test runner configured for the server package — `npm run test` at the repo root only runs Playwright e2e for the web app. Given §1's bug, this is the clearest possible argument for adding authorization tests specifically: a test asserting "a token obtained via `/api/join/:code` must be rejected by `/session/:id/lock`" would have caught this before it shipped, and is cheap to write once §1 is fixed.

### 2.4 — Admin endpoints protected by a single static bearer token, no audit trail on admin actions themselves
`requireAdminToken` checks `req.query.token === process.env.ADMIN_TOKEN` — a single shared secret, passed as a URL query parameter (which means it can end up in server access logs, browser history, and Referer headers, all of which are classic places static tokens leak from). The admin routes are also genuinely powerful (`/admin/sessions/:id/end` force-closes any session; `/admin/retention` changes data-retention policy for everyone). There's no logging of *who* (or from where) used the admin token for a given action, so if it ever does leak, there's no way to distinguish legitimate admin use from abuse after the fact. Recommend: move the token to an `Authorization: Bearer` header (not a query param), and log every admin action with the requesting IP at minimum, ideally with per-admin tokens rather than one shared secret.

### 2.5 — `validateWebhookUrl`'s SSRF protection has a real gap: it only checks IPs at webhook-creation/fire time via a single DNS lookup, not per-request
`validateWebhookUrl` does a `dns.lookup` and rejects private-range IPs — this is a genuinely good, non-obvious protection to have included (most side projects skip SSRF protection on user-supplied webhook URLs entirely, so credit where due). But it's checked once per delivery call, resolving the hostname fresh each time (looking at `fireWebhook`, `validateWebhookUrl` is called inside the `Promise.allSettled` map on every fire, so it re-resolves each time — good), which mitigates classic DNS-rebinding somewhat since it's not a check-then-cache pattern. What's still open: nothing pins the resolved IP for the actual `fetch()` call afterward — `validateWebhookUrl` resolves and validates a hostname, then `fetch(url, ...)` re-resolves the same hostname independently via Node's own DNS resolution, which is exactly the DNS-rebinding gap (attacker's DNS returns a public IP for the validation lookup, then a private/internal IP microseconds later for the actual fetch, since nothing forces the two lookups to agree). This is a narrow, timing-dependent attack, not a trivial one, but worth closing properly by resolving once and connecting to the validated IP directly (e.g., via a custom `dns.lookup` override or an agent that pins the resolved address) rather than validating a hostname and then letting `fetch` re-resolve it.

### 2.6 — Guest-supplied `guestName` on the knock flow is never sanitized before being broadcast
`relay.js`'s `knock` handling sends `msg.guestName || ''` straight to the host's client (`host.send(JSON.stringify({ type: 'knock', peerId, name: msg.guestName || '' }))`) with no length cap or content filtering server-side. If the host's rendering of the knock modal doesn't independently escape/sanitize this client-side, this is a stored/reflected-in-realtime XSS vector (a guest sets their "name" to a script payload, the host's browser renders it in the knock UI). Not confirmed exploitable without reading the web client's knock-modal component, but worth an explicit check — this is exactly the kind of small, easy-to-miss field that becomes an XSS finding in a security review.

---

## 3. Missing-but-not-broken (completeness gaps from the original pass, still accurate)

- No shipped Supabase schema/migrations in the repo — matches `sessions`, `profiles`, `audit_events`, `webhooks`, `whiteboards` tables referenced throughout `index.js`/`db.js`, but the actual `CREATE TABLE` definitions/RLS policies aren't in the repo (README says this is intentional for the public repo). Still means nobody else can stand this up without reverse-engineering the schema from query shapes.
- No TURN server configuration visible — WebRTC will fail to connect for guests behind symmetric NAT/strict corporate firewalls without one; worth confirming this is handled (e.g., via a TURN provider env var) somewhere in the web client's peer connection config.
- Mobile app (`apps/mobile`) and companion app (`apps/companion`, Tauri) weren't deeply inspected in this pass — given §1's severity, prioritize checking whether either of those clients also relies on the same shared token, since the companion app's OS-level remote control makes a token leak there considerably higher-stakes than the browser client.

---

## 4. Design ideas

1. **Per-guest revocable access, not just a shared secret.** Once §1 is fixed with a dedicated guest token, go one step further: make each admitted guest's session token unique and revocable individually (rather than one shared guest token for the whole room), so a host can kick *and permanently ban* a specific disruptive guest without needing to rotate the link for everyone else. The `pendingGuests`/`approvePendingGuest` flow already tracks guests by `peerId` — extending that to per-peer tokens is a natural evolution, not a rearchitecture.
2. **Surface the "knock" approval flow as a differentiator.** This approval/knock UX (host approves each guest by name before they're admitted) is more thoughtful than most consumer screen-share tools (Zoom's waiting room is closest, but CollabStream's is baked into a link-based, no-account-needed flow, which is a nicer default for spontaneous sharing). Worth leading with this in marketing copy rather than burying it as one of three `joinMode` options.
3. **Live webhook delivery log**, visible to the business-plan host in the dashboard — right now failed webhook deliveries are only `console.warn`'d server-side (`fireWebhook`'s `Promise.allSettled` results), invisible to the customer who configured the webhook. A simple delivery-log table (status, timestamp, response code, retry button) is the single most-requested feature type for any webhook-consuming product and currently doesn't exist here at all.
4. **Session "health" indicator during a call** — since the server already tracks `lastActive`/idle TTL and pings every 30s (`ws.ping()`), surfacing basic connection-quality signal (RTT from the ping/pong round trip, or WebRTC's own stats API) directly in the UI would meaningfully improve the "is this actually working" experience during a call, which is the #1 support complaint category for any screen-share tool.

---

## 6. New findings from this pass's security review

While checking companion/mobile for the §1 issue and doing a broader security sweep, two more
real, previously-undiscovered issues turned up. Neither was in the original audit scope.

### 6.1 — Critical: the companion's local remote-control relay had no access control at all
Severity-wise, this is arguably worse than §1. `apps/companion/src-tauri/src/relay.rs` runs a
WebSocket server on `ws://127.0.0.1:7734` that the host's browser tab connects to in order to
arm and forward OS-level mouse/keyboard input (real input injection, not just app-level
control). The relay accepted an `arm` command carrying **any token the connecting client
supplied itself** — there was no check that the token was ever actually issued by a real
CollabStream session, and no check on who was even allowed to connect in the first place.

Concretely: **any webpage open in any browser on the host's machine** — not just a
CollabStream tab, any tab at all — could open `ws://127.0.0.1:7734` (browsers don't apply
CORS/same-origin restrictions to WebSocket connections), send `{"type":"arm","token":"x"}`
with a token of its own choosing, then send `{"type":"input","token":"x",...}` events, and
full keyboard+mouse control of the host's OS would be granted — no CollabStream session, no
guest, and no interaction beyond having the tab open. This is genuinely a full local input
hijack, not a theoretical concern.

**Fixed:** the WS handshake now checks the connecting page's `Origin` header against an
allowlist (`COLLABSTREAM_ALLOWED_ORIGINS` env var, defaulting to the local dev server) before
accepting the connection at all — see `check_origin`/`accept_hdr_async` in `relay.rs`. Origin
headers are set by the browser itself and can't be forged by page JavaScript, so this closes
the realistic "malicious webpage" attack vector completely.

**Not fully closed:** this does not protect against a different local process on the same
machine (not a browser) deliberately forging its own Origin header — a raw TCP client isn't
bound by the same-origin honesty browsers enforce. Fully closing that would need a paired
shared secret (e.g. a pairing code shown once in the companion UI, entered into the web app),
which is a real UX/onboarding change, not a drop-in fix, and is flagged as follow-up work
rather than implemented here. Documented in `apps/companion/README.md`.

**Could not be compile-tested.** I don't have a Rust toolchain against this project or the
ability to run `cargo build`/`cargo check` on this machine, so I verified the exact
`tokio-tungstenite 0.21` API (`accept_hdr_async`, the `Callback` trait, `ErrorResponse` type)
against current documentation before writing it, and kept the change as small and structurally
conservative as possible — but **please run `cargo check` yourself before shipping this.**

### 6.2 — IDOR on the cloud-recording routes: any business-plan user could read or overwrite any other host's recording
`GET /api/sessions/:sessionId/recording` and `POST /api/sessions/:sessionId/recording` both
checked `requireAuth`/`requirePlan('business')` but never checked that `req.params.sessionId`
actually belonged to `req.user.id` — every other `/api/sessions/:id/*` route in `index.js`
(e.g. `/audit`) has this ownership check; these two routes were the exception. In practice this
meant any authenticated business-plan account could fetch a presigned download URL for, or
overwrite the `recording_url` pointer of, any session by id — including sessions belonging to
other hosts, if the attacker learned that session's id (e.g. from a shared join link).

**Fixed:** both routes now look up the session's `host_id` and return 404 (not 403, to avoid
confirming a given session id exists) unless it matches `req.user.id`, matching the pattern
already used correctly elsewhere in the same file.

---

## 7. Priority order

1. Fix the shared host/guest token bug (§1) — do this before anything else, including before writing tests, since the tests should verify the *fixed* behavior.
2. Rename `getPeer` (§2.2) — trivial, do it in the same PR as §1 since you'll already be touching every call site.
3. Add authorization tests proving guest tokens can't hit host-only endpoints (§2.3), and add SSRF-pinning fix for the webhook fetch (§2.5).
4. Move admin token to a header, add per-action logging (§2.4).
5. Sanitize/cap `guestName` before broadcast, confirm client-side escaping (§2.6).
6. Address the in-memory single-instance scaling ceiling (§2.1) once there's an actual need to scale past one instance — not urgent pre-launch, but plan the Redis-backed room registry before it's needed under load, not during an incident.

---

## Checklist

### Critical
- [x] Separate `hostToken` and `guestToken` issued per room; `verifyToken`/WS `register` take a `role` param and enforce it — §1
- [x] `/api/join/:code` and `/join/:code` no longer return the host token to guests — §1
- [x] Authorization test: a guest-obtained token is rejected by `lock`/`cap`/`audit` endpoints — §1, §2.3

### Other fixes
- [x] `getPeer` renamed to something unambiguous (e.g. `getHostSocket`, no role param) — §2.2
- [x] Server-package test suite added, covering rooms/relay/stripe at minimum — §2.3 *(rooms.js: 20 tests; relay.js: 20 integration tests against real rooms.js with fake WebSocket objects; stripe.js: 5 tests. 45 total, all passing. `npm test` fixed — `node --test test/` doesn't reliably discover files on this Node version, changed to bare `node --test` which auto-discovers `*.test.js`.)*
- [x] Admin token moved from query param to `Authorization` header — §2.4
- [x] Per-action logging added for admin routes (who/what/when) — §2.4
- [x] Webhook SSRF fix: resolved IP pinned for the actual `fetch()`, not re-resolved independently — §2.5
- [x] `guestName` sanitized/length-capped server-side before broadcast; client-side escaping confirmed — §2.6

### Completeness
- [x] Supabase schema/migrations published (even sanitized) so the project is actually deployable by others *(`supabase/example_schema.sql` — a from-scratch example schema, RLS policies, and indexes derived by reading every Supabase query in `db.js`/`index.js`. Explicitly labeled as an example, not the maintainer's real private migration history, and placed outside `supabase/migrations/` so it can't be confused with it.)*
- [x] TURN server configuration confirmed/added for guests behind strict NAT *(already implemented in `lib/webrtc.js` via `VITE_TURN_URLS`/`VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL`, but wasn't in `.env.example` — added there plus a note in README's Security Notes. This was a documentation gap, not a code gap.)*
- [x] Companion (Tauri) and mobile clients checked for the same shared-token issue as §1 *(mobile: clean, guest-only, correctly uses `/api/join/:code`. Companion: does NOT have the same issue, but a more severe local vulnerability was found instead — see §6 below.)*

### Design ideas
- [x] Per-guest individually revocable tokens (not one shared guest secret) — §3.1 *(each browser mints its own token via `/api/join/:code`; host can kick, or kick+ban to block the IP too — see `rooms.js` `issueGuestToken`/`revokeGuestToken`/`banIp` and the new `kick` WS message in `relay.js`. Covered by 8 new tests.)*
- [x] Knock/approval flow promoted as headline marketing differentiator — §3.2 *(new lead-in paragraph in README.md, 4th feature card + comparison-table row on the landing page)*
- [x] Live webhook delivery log visible to business-plan hosts — §3.3 *(`webhook_deliveries` logging in `db.js`, `GET /api/webhooks/:id/deliveries`, "View log" panel in Settings — requires adding the `webhook_deliveries` table to your own Supabase project, noted in README)*
- [x] In-call connection-quality/session-health indicator — §3.4 *(this already existed — `useNetworkQuality` + `NetworkBadge`, RTT/loss/bitrate/connection-type, shown to both host and guest. Only change made: host's indicator now follows the focused/spotlighted guest instead of always the first one.)*

### Scaling (plan ahead, not urgent pre-launch)
- [x] Redis-backed (or equivalent) shared room registry planned before horizontal scaling is needed — §2.1 *(`docs/scaling-plan.md` — a design doc, deliberately not code. Rewriting rooms.js's core token/ban/admission logic into a distributed store without a real Redis instance to test against would be worse than not doing it. Covers: why this isn't urgent yet, what actually breaks with 2+ instances today, sticky sessions as a near-free stopgap, and the real migration's shape and sequencing when it's actually needed.)*

### New findings from this pass (§6)
- [x] Companion local relay Origin-check added, closing the "malicious webpage" input-hijack vector — §6.1 *(NOT compile-tested — no Rust toolchain available here. Verified the tokio-tungstenite 0.21 API against current docs and kept the change minimal, but run `cargo check` before shipping. Residual risk from non-browser local processes documented, not closed.)*
- [x] Recording-route IDOR fixed: both `/api/sessions/:sessionId/recording` routes now check `host_id` ownership — §6.2
