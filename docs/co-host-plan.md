# Co-host / backup host: plan

**Status: Option A (assisted moderation) built.** Option B (true failover) remains planning-only
— see the section below for why. Server logic (`rooms.js`, `relay.js`) is implemented and
covered by automated tests (`test/rooms.test.js`, `test/relay.test.js`, run via `npm test` in
`apps/server`, 62/62 passing). UI is wired up in `HostRoom.jsx` and `GuestRoom.jsx`. Not yet
verified against a real browser/WebSocket end to end.

## The question this plan has to answer first

"Co-host" sounds like a permissions flag — check a box, guest B can now do what the host does.
The hub-and-spoke architecture (see the topology discussion earlier in this project) makes that
untrue in an important way, and it's worth being explicit about *why* before designing anything:

**Most host powers only exist inside the original host's browser tab**, because that's the only
place the actual `RTCPeerConnection` objects live. Muting a guest, kicking them, granting the
floor — all of it calls into `useWebRTCHost.js`'s `pcsRef`, a `Map` that exists in one specific
browser's memory. A "co-host" sitting in a *different* browser window has no access to that Map
at all. They can't directly mute another guest's audio, because they don't hold a connection to
that guest — only the original host's tab does.

This means "co-host" splits into two genuinely different features with very different scope:

### Option A — Assisted moderation (smaller, real, doesn't solve the failover problem)
A designated guest gets a moderator UI. Clicking "Kick" or "Mute" in *their* browser sends a
command over the data channel to the **original host's** browser, which executes it on their
behalf (the host's tab is still the one actually calling `hostRTC.closePeer()` etc.).

- Real and buildable with the existing architecture.
- **Requires the original host to still be connected.** This is moderation help, not
  redundancy — it does nothing for "the host's laptop died mid-call."
- New message type: `cohost-action` (co-host → host), `{ action: 'kick'|'mute'|'grant-floor'|...,
  targetPeerId }`. Host's `handleDataMessage` gets a case that re-dispatches to the exact same
  functions the host's own UI buttons call (`handleKick`, `handleGrantFloor`, etc.) — no new
  logic, just a second caller.
- Server-side: `rooms.js` gets a `coHostPeerIds: Set()` per room, and a `promote-cohost`/
  `demote-cohost` WS message pair (host-only) so the co-host badge is tracked and audit-logged,
  matching the `floorPeerId` pattern from floor mode.
- `relay.js`'s existing role checks (e.g. the `kick` handler's `if (!meta || meta.role !== 'host')
  return`) would need a `isCoHost(sessionId, meta.peerId)` escape hatch for the specific actions
  a co-host is allowed to *request* — but note this only needs to gate the `cohost-action`
  message type reaching the host, not grant the co-host any of the REST-endpoint or WS actions
  that currently require `hostToken` (lock, cap, audit, floor-grant/revoke bookkeeping). Those
  stay host-only; the co-host asks, the host's own client executes.
- Scope co-host powers deliberately narrow at first: kick/ban and mute feel safe to delegate;
  ending the session, locking it, or changing the guest cap probably shouldn't be, at least not
  in a first version.

### Option B — True failover / host handoff (the actual redundancy feature, much bigger)
For the room to survive the *original* host disconnecting, a different browser has to become
the real hub — meaning it needs to open real `RTCPeerConnection`s to every other guest, from
scratch. This is not a permissions change, it's "migrate the call to a new hub live."

Rough shape, none of it small:
1. Host designates a backup guest ahead of time (`rooms.js`: `room.backupPeerId`).
2. On the server detecting the host's WS closing (`leaveRoom`'s existing `role === 'host'`
   branch), if a backup is designated and currently connected, mint a **new** host-scoped token
   for them (not reuse the original `hostToken` — see the token-model note below) and notify
   their client to promote itself.
3. The backup's browser instantiates its own `useWebRTCHost` instance and opens fresh
   `RTCPeerConnection`s to every other currently-connected guest. Every other guest's browser
   needs to tear down its connection to the now-dead original host and negotiate a new one to
   the backup — essentially the same connection-establishment flow as a fresh join, but for
   everyone simultaneously, without literally rejoining the room.
4. Screen share, whiteboard state, and floor state all need to be handed off or re-established
   on the new hub — none of that state currently lives anywhere except the original host's
   memory (`floorStateRef`, `pcsRef`, etc. in `useWebRTCHost.js`) or the browser-side annotation
   canvas.
5. **Token model implications, why this needs care given §1's history:** the original audit's
   critical finding was exactly about a token boundary being crossed incorrectly. Minting a
   *second* valid host-scoped token (for the backup) means `verifyToken(sessionId, token,
   'host')` in `rooms.js` needs to check membership in a small set of valid host tokens rather
   than equality against one string — a real, if small, change to the function that gates every
   host-only REST route. This is exactly the kind of change that deserves its own focused
   security review before merging, not a footnote in a bigger feature.

## Recommendation

Build Option A first if this is wanted soon — it's genuinely useful (letting a trusted guest
help moderate a large session) and doesn't touch the token model at all. Treat Option B as a
separate initiative with its own design pass specifically focused on the token/verification
change, given the history in this codebase around exactly that boundary.

## Rough checklist (Option A only — for whoever picks this up)
- [x] `rooms.js`: `coHostPeerIds` set per room, `promote-cohost`/`demote-cohost` audit-logged.
- [x] `relay.js`: host-only promote/demote handlers.
- [x] `HostRoom.jsx`: handle incoming `cohost-action` messages, re-dispatching to existing
      handler functions (`handleKick`, `handleGrantFloor`, `handleAllowSpeak`, etc.) rather than
      duplicating their logic.
- [x] Guest-side UI: once promoted, show moderator controls (kick/mute/floor buttons) in the
      guest's own roster view, sending `cohost-action` instead of calling anything directly.
- [x] Explicit, visible indicator to everyone in the room that a co-host is active and who it is
      — this is a trust/transparency question as much as a technical one.
- [x] Decide and document the exact action allowlist (start narrow: kick, ban, mute; not lock,
      not end-session, not guest-cap changes).

## Implementation notes (added after building this)
- Co-host status lives in two places by design: `rooms.js`'s `coHostPeerIds` Set (source of
  truth, gates nothing by itself) and a mirrored `coHostPeerIds` Set in `HostRoom.jsx`'s React
  state (so the UI can render badges without round-tripping through the server on every render).
  The guest side never tracks its own status independently — `GuestRoom.jsx` derives `isCoHost`
  from the `cohost` flag on its own roster entry, broadcast by the host on every roster update,
  so it can never drift from what the host actually granted.
- Action allowlist implemented: `kick`, `ban`, `mute`, `unmute`. Not implemented (deliberately):
  `lock`, `end-session`, `guest-cap` changes, floor grant/revoke, screen-share approval — all
  stay host-only, matching the plan's "start narrow" recommendation.
- The `cohost-action` message travels over the existing host↔guest WebRTC data channel, not
  through the signaling server — the server's `promote-cohost`/`demote-cohost` messages only
  handle the badge itself (bookkeeping + audit trail), never the moderation actions a co-host
  requests. This was a deliberate scope decision (see the comment above the `promote-cohost`
  case in `relay.js`): reusing the host's already-open connection to the target guest avoids
  teaching `relay.js` a second, parallel authorization path for actions the `kick` handler
  already gates on `meta.role === 'host'`.
- Demotion is defense-in-depth in three places: the server's `kick` handler (`relay.js`), the
  host's own `handleKick` (`HostRoom.jsx`), and `leaveRoom`'s disconnect cleanup (`rooms.js`) —
  a kicked, banned, or disconnected guest can never retain a stale moderator badge.
- Server-side covered by `test/rooms.test.js` and `test/relay.test.js` (promote/demote,
  promotion requires an *admitted* guest not a pending one, non-host senders are ignored,
  kicking a co-host demotes them). Not yet verified against a real browser/WebSocket end to end
  — that's the one remaining gap before calling this fully done.
