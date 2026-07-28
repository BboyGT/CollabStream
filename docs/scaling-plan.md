# Scaling plan: beyond a single signaling-server instance

**Status: planning document, not implemented.** This is deliberately a design/runbook, not
code — see AUDIT.md §2.1 and the "Scaling" checklist item. Rewriting `rooms.js`'s in-memory
`Map` into a distributed store is real surgery on the most security-sensitive code in this
repo (session tokens, guest admission, IP bans), and doing that without a Redis instance to
actually test against would be worse than not doing it at all. This document exists so that
work is scoped and sequenced correctly *when* it's actually needed, rather than improvised
during a capacity incident.

## Why this isn't urgent today

`rooms.js` keeps all room state in a single process's memory (`const rooms = new Map()`).
That's fine as long as:
- One server process handles all traffic (no horizontal scaling), and
- A restart dropping every active session is an acceptable cost.

For CollabStream's current scale (a video-call/screen-share tool, not a broadcast platform),
one reasonably-sized Node process can hold many thousands of concurrent WebSocket connections
in memory — the bottleneck is far more likely to be CPU (JSON parsing/serialization on the
signaling hot path) or the host machine's network throughput than the process running out of
room for `Map` entries. **Don't build this until there's an actual, measured need** — i.e.,
you're seeing CPU saturation or connection-count ceilings on a single instance, not before.

## What breaks first, and why

If you naively put a second instance of `apps/server` behind a load balancer today, here's
what happens: a host's browser opens a WebSocket to instance A, registers, gets a room
created in instance A's in-memory `Map`. A guest's browser opens a WebSocket to instance B
(round-robined by the LB) and tries to register into the same `sessionId` — but instance B's
`rooms` Map has never heard of that session. The guest gets `room-not-found` and nothing
works. This isn't a subtle bug; it fails immediately and obviously for any session split
across instances, which — with a round-robin or least-connections LB and no session affinity
— is most sessions.

## Two ways to fix it, and why one is much easier

### Option A: Sticky sessions (do this first, it's nearly free)
If your load balancer supports session affinity (e.g. by cookie, or by `sessionId` in the
WS URL/query string with consistent hashing), pin every WS connection for a given
`sessionId` to the same backend instance. Both the host and every guest for a room end up on
the same process, and **the existing in-memory `rooms.js` keeps working entirely unchanged.**

This doesn't fix the "a restart drops the room" problem, and it doesn't let you rebalance
load across instances for a session that's already grown large, but it gets you real
horizontal scaling (different *rooms* on different instances) with zero application code
changes. This is very likely sufficient for a long time — reach for Option B only once
sticky sessions themselves become the bottleneck (e.g. wildly uneven load because a handful
of huge rooms land on one instance) or you need restart-survivability.

### Option B: Externalize room state (Redis or equivalent) — the real fix
This is the actual distributed-systems version. Rough shape:

1. **Room metadata → Redis.** `hostToken`, `guestTokens` (with revoked/peerId/ip),
   `bannedIps`, `joinCode`/`shortCode` → `sessionId` lookup, `locked`, `joinMode`,
   `maxGuests`, `expiresAt`, etc. all move from the in-memory room object into Redis hashes/
   sets, keyed by `sessionId`. `getRoomByJoinCode` becomes a Redis lookup on a
   `joinCode → sessionId` index instead of iterating an in-memory Map.

2. **WebSocket connections themselves cannot be shared across processes** — a `ws` connection
   object only exists in the memory of the process that accepted it. This means `getHostSocket`,
   `getGuest`, `getGuests` (which currently return live `ws` objects to call `.send()` on)
   need to become "which instance is this peer connected to" + a cross-instance message bus to
   actually deliver to them. This is the part that's genuinely new work, not just moving data:
   - Use Redis pub/sub (or NATS, or anything similar) with one channel per `sessionId`.
   - Every instance subscribes to channels for sessions it has local connections for.
   - `relay.js`'s message routing changes from "look up the ws object and call `.send()`"
     to "look up which instance(s) hold sockets for this session, publish the message on that
     session's channel, and have the owning instance deliver it to its local ws connections."
   - This is the same pattern Socket.IO's Redis adapter and similar libraries use — worth
     evaluating one of those instead of hand-rolling it.

3. **`verifyToken`, `issueGuestToken`, `bindGuestToken`, `revokeGuestToken`, `banIp`,
   `isIpBanned`** all become Redis reads/writes instead of Map lookups. These are the
   highest-stakes functions in the codebase (see AUDIT.md §1) — this migration needs its own
   dedicated test pass re-running everything in `test/rooms.test.js` and `test/relay.test.js`
   against the Redis-backed implementation before it replaces the in-memory one, not just a
   visual diff of the code.

4. **Room expiry / idle cleanup** (`cleanupRooms`) needs to become either a Redis key TTL
   (simplest — set `EXPIRE` on room keys matching `expiresAt`/idle timeout) or a scheduled
   job that one instance runs (needs a leader-election or "only instance 0 runs cron" guard
   so it doesn't run N times redundantly, which is harmless here but wasteful).

5. **Restart survivability** falls out of this almost for free once state lives in Redis
   instead of process memory — a restarted instance just resumes reading/writing the same
   Redis keys. The client-side reconnect flow (does the web client auto-reconnect and
   re-register on WS drop today? worth confirming — see AUDIT.md §2.1) still needs to
   actually attempt to resume rather than just show a dead connection, but the *server* side
   of "session survives a restart" is solved by this migration.

## Suggested sequencing when the time comes

1. Sticky sessions (Option A) first — cheap, immediate, no app code changes.
2. Add a feature flag / env var to switch `rooms.js` between the in-memory and Redis-backed
   implementations, so the migration can be tested in a staging environment side-by-side
   before it's the only code path.
3. Migrate read-mostly, low-stakes state first (e.g. `joinCode`/`shortCode` lookup) to prove
   the pattern, then the higher-stakes token/ban logic, with the full test suite re-run
   against each.
4. Add the pub/sub cross-instance delivery layer last, once state itself is externalized —
   it's the piece most likely to introduce subtle ordering/delivery bugs, so it benefits most
   from everything else already being stable.
5. Load-test before and after each step, not just at the end.

## Non-goals for this document

This is not a decision to use Redis specifically — any equivalent (a managed pub/sub +
key-value service, a different in-memory data grid, etc.) works for the same reasons. Redis
is used above as shorthand because it's the most common choice for exactly this pattern, not
because it's the only correct one.
