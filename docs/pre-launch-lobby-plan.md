# Pre-launch lobby: plan

**Status: built.** Server logic (`rooms.js`, `relay.js`, `index.js`) is implemented and covered
by automated tests (`test/rooms.test.js`, `test/relay.test.js`, run via `npm test` in
`apps/server`, 86/86 passing — 24 new tests added for this feature). UI is wired up in
`AppLanding.jsx` (Schedule for later), `HostRoom.jsx` (lobby view + Start call), and
`GuestRoom.jsx` (lobby waiting screen). Not yet verified against a real browser/WebSocket end
to end.

## The idea, in one sentence

A host schedules a session ahead of time; invited guests can open the join link and land in a
shared lobby — see each other arrive, chat with each other (and the host, once present) — any
time before the host actually starts the session, not just in the seconds before an individual
guest is admitted into an already-live call.

## Why this isn't already covered

Three existing pieces sound related but each misses this specifically:

- **"Schedule" (`ScheduleModal.jsx`).** Purely a calendar-invite generator — downloads an
  `.ics` file and offers a Google Calendar link. It only exists *inside an already-running
  session* (opened from the host's toolbar mid-call) and just repackages that live session's
  existing join link/code into an invite. It doesn't create anything new, and there's no
  "scheduled, not-yet-started" session state anywhere in the system today — see below.
- **Waiting-room chat (`docs/waiting-room-chat-plan.md`, built).** Scoped to one individual
  guest talking to the host, only inside a session that's *already running* with Approval join
  mode on. It requires a host WS connection to relay through (`getHostSocket(sessionId)` — see
  `relay.js`'s `waiting-chat` handler); with no host connected yet, that returns `null` and
  messages silently go nowhere. It also has no guest-to-guest dimension at all — it's strictly
  1:1 with the host.
- **Co-host (`docs/co-host-plan.md`, Option A built).** About delegating moderation authority
  to a guest inside a live session. Unrelated to session lifecycle/scheduling entirely.

## A surprising finding: half of this already sort of works, by accident

Before assuming this needs a new session state built from scratch, I traced what actually
happens today if a guest's join request arrives before any host has connected:

- `POST /session` creates the room in `rooms.js` immediately with `room.host = null` — the
  in-memory room already tolerates a host-less state from the moment it's created. It's not
  populated with a host until the host's browser separately sends a `register` WS message
  (normally a fraction of a second later, since `AppLanding.jsx`'s `handleStart()` immediately
  navigates the creator into `HostRoom.jsx`, which immediately opens that WS connection — but
  those are two separate steps that merely *happen* to run back-to-back today).
- `leaveRoom()`'s host-disconnect path already sets `room.host = null` without deleting the
  room (as long as guests remain) — so "a room exists with no host currently connected" is
  already a handled, non-exceptional state, for host-reconnect purposes.
- Critically: **`joinRoom()`'s guest path never checks whether `room.host` is set at all.**
  Neither do `/api/join/:code` or `/join/:code`. A guest can already successfully mint a token
  and register via WS even if no host has ever connected.
- `GuestRoom.jsx`'s `!peerConnected` branch already renders a "Waiting for host…" screen with a
  spinner, and after 30s idle shows "Host may be setting up. This page will connect
  automatically." — this is, functionally, already a primitive one-guest lobby waiting screen.

So the raw mechanic of "a guest can arrive before the host and see a waiting state" isn't
hypothetical — it's already reachable today, just never as an intentional, supported flow, and
undermined by the gaps below.

## What actually blocks this from working as a real feature

1. **Session expiry math assumes the meeting starts at creation time.** `createRoom()` sets
   `expiresAt: now + durationMinutes * 60 * 1000` at the moment `POST /session` is called —
   `durationMinutes` represents *meeting length* (45min–8h depending on plan), not "how long to
   wait before start." A session "scheduled" for even a few hours out by simply creating it
   early and not opening `HostRoom.jsx` yet would already be past `expiresAt` — and therefore
   deleted by `cleanupRooms()` (runs every 60s) — before the scheduled time ever arrives.
2. **Idle timeout would delete it even sooner.** `IDLE_TTL_MS` is 45 minutes; `cleanupRooms()`
   deletes any room untouched for that long. Nothing about "guests are scheduled to arrive
   later" currently exempts a room from this.
3. **No UI flow creates a session without immediately becoming its host.** `AppLanding.jsx`'s
   `handleStart()` always calls `navigate('/room/:id/host?token=...')` right after `POST
   /session` succeeds. There's no "create it, then come back and start it later" path — no
   screen to browse back to, no way to retrieve the host token for a session created earlier
   without it being in that one browser's `localStorage`/URL from that one moment.
4. **No guest-to-guest chat transport exists, at any point, host present or not.** Even
   *today's* in-call chat isn't guest-to-guest — it's guest→host, host rebroadcasts (see
   `chatDispatch` in `HostRoom.jsx`). With no host connected at all, there's nothing to
   rebroadcast through. A genuine multi-guest lobby needs a broadcast-among-guests channel that
   doesn't depend on a host being present, which nothing in `relay.js` does today — every
   existing broadcast path assumes a host is the hub.
5. **No host-side visibility into who's already waiting.** Even once a host does connect to a
   session with people already in the lobby, there's no signal today like "3 guests have been
   waiting since 2:14pm" — the host would just see them appear as ordinary `peer-joined` events,
   indistinguishable from guests joining an already-open call live.

## Open product decisions (not silently deciding these)

- **Does Approval join mode still apply once the host arrives?** i.e., do lobby guests who
  already waited (and were visibly chatting) still need to be individually admitted via the
  knock flow, or does "they already arrived and were visible in the lobby" count as implicit
  admission once the host starts the session? These are genuinely different guest experiences
  and should be a deliberate choice, not an accident of how the code happens to be wired.
  **Settled: auto-join, no re-admission.**
- **Does the guest cap apply to the lobby, or only to the live call?** If `maxGuests` is 3, can
  10 people sit in the lobby and only the first 3 get into the actual call, or is the lobby
  itself capped? **Settled: the lobby is uncapped; the cap gates only the live call.**
- **Does `durationMinutes` (session length) start counting from lobby-open or from the host
  actually starting the session?** The obviously-correct answer is "from actual start," which
  means `expiresAt` needs to be computed at start-time, not creation-time — but that's a
  meaningful change to `createRoom()`'s current assumptions and should be called out as a
  deliberate decision, not slipped in silently. **Settled: from actual start.**
- **Can the host chat into the lobby before "starting," or does their presence = started?** i.e.
  is there a state where the host has joined the lobby to chat/greet people but the actual
  video call hasn't begun yet, or does the host connecting immediately mean "live"? **Settled:
  the host can join and chat in the lobby before starting.**

## Rough shape of the work (not a commitment to this exact design)

### Server (`rooms.js`, `relay.js`, `index.js`, `db.js`)
- [x] `POST /session` gains an optional `scheduledStartAt` (or a simpler `deferred: true`) so
      creation doesn't require the creator to register as host immediately afterward.
- [x] `expiresAt`/idle-timeout logic needs a distinct "lobby" grace period, separate from the
      in-call `durationMinutes` countdown — a scheduled-but-not-started session shouldn't be
      swept by the same 45-minute idle timer built for an active call.
- [x] A lobby-scoped guest bucket and broadcast path in `relay.js` that works with zero host
      connected — new WS message type(s) for lobby chat, broadcasting to every currently-lobby-
      connected guest (not routed through a host at all, unlike every existing broadcast path).
- [x] When the host does connect, a summary of who's been waiting (names, arrival order) so the
      "3 guests are already here" moment isn't a surprise.
- [x] `db.js`/`sessions` table: a `status` value for "scheduled" distinct from `active`/`ended`,
      if scheduled sessions should show up in the host's Dashboard before they've ever run.
      Built with `status='scheduled'`, `host_token` persistence for owner resume, and a migration
      that expands the status check constraint.

### Client — host side (`AppLanding.jsx`, `ScheduleModal.jsx` or a new component, `Dashboard.jsx`)
- [x] A real "Schedule for later" path at session creation, distinct from "Start Session" now —
      creates the session, but (see the Dashboard caveat above) still enters the room — just into
      a lobby sub-state rather than a live call, instead of returning to the dashboard/homepage.
      The Dashboard now also lists scheduled sessions, so the host can leave and reopen one later.
- [x] Somewhere to find and open a previously-scheduled-but-not-yet-started session again -
      Dashboard now labels scheduled sessions and shows an Open action for the owning host.
- [x] `HostRoom.jsx` needs a "lobby" sub-state distinct from the live call — showing who's
      waiting and letting the host chat with them before clicking a real "Start call" action.

### Client — guest side (`GuestRoom.jsx` or a new lobby-specific view)
- [x] A proper lobby screen replacing/extending today's accidental `!peerConnected` "Waiting for
      host…" state — showing other arrived guests and a shared chat thread, not just a spinner.
- [x] Handling the transition from "lobby" to "the host started the call" without a jarring
      reload — the same WebSocket connection carries through; the client swaps UI state on a
      `session-started` (admitted) or `pending-approval` (overflow, falls back to the existing
      knock flow) message rather than the guest needing to rejoin.

## Implementation notes (added after building this)

- The three settled product decisions above, as actually built: lobby guests who already waited
  are admitted straight into the live call with no re-admission (`startCall()` in `rooms.js`);
  the guest cap gates only the live call, the lobby itself is uncapped; the session-length clock
  (`durationMinutes`) starts counting from the actual `startCall()` moment, not from
  creation/scheduling time (`expiresAt` is recomputed then). The host CAN join and chat in the
  lobby before starting — `HostRoom.jsx` defers `requestMedia()` until `sessionStarted !== false`,
  so no camera is held open during a long pre-start wait, for either the host or any guest.
- Overflow handling (lobby guests who exceed the cap once the host starts) deliberately reuses
  the *existing* knock/approval infrastructure end to end — they land in the same `pendingGuests`
  bucket, trigger the same `knock` message to the host, and show up in the same knock panel with
  Admit/Decline/chat already built. Zero new host-side UI was needed for this case.
- The lobby chat broadcast (`lobby-chat` in `relay.js`) is the one genuinely new transport
  pattern in this codebase: every other broadcast path assumes a host is the relay hub over
  WebRTC data channels, but there's no WebRTC at all before a call starts. This one goes straight
  through the signaling WebSocket instead, broadcasting directly to every currently-connected
  lobby guest plus the host (if present). Deliberately has no per-sender rate limit yet (unlike
  waiting-room chat's 5/min) — flagged as a simplification in the code, not an oversight.
- Dashboard persistence is now built: scheduled sessions are stored as `status='scheduled'`,
  show in the host dashboard, and can be reopened by the owner via the stored host resume token.
- Server-side covered by `test/rooms.test.js` and `test/relay.test.js` (lobby join/uncapped/no-
  approval-mode, `startCall`'s cap-and-overflow split, `expiresAt` recomputation, the host-
  disconnect-doesn't-delete-a-lobby guard, the 24-hour lobby idle exemption, lobby-chat broadcast
  in both directions with sender-echo suppression, and the full `start-call` admit/overflow wire
  format) — 86/86 passing. Not yet verified against a real browser/WebSocket end to end.

## Honest risk assessment

This is a bigger, more architecturally-real piece of work than either co-host or waiting-room
chat — it touches session *lifecycle*, not just in-room UI. The good news is the core "a guest
can technically exist in a room before a host does" primitive already works today, unintended;
the real work is the expiry/idle-timeout math, an intentional creation-without-host-entry UI
flow, and — the genuinely new piece — a broadcast chat path that doesn't route through a host at
all, which nothing in the current relay model does. The open product decisions above (Approval
interaction, guest cap scope, when the duration clock starts) should be settled with the person
who owns the product before writing code, not assumed.
