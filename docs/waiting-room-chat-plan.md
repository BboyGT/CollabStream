# Waiting-room chat: plan

**Status: built.** Server logic (`rooms.js`, `relay.js`) is implemented and covered by
automated tests (`test/rooms.test.js`, `test/relay.test.js`, run via `npm test` in
`apps/server`, 53/53 passing). UI is wired up in `GuestRoom.jsx` and `HostRoom.jsx`. Not yet
verified against a real browser/WebSocket end to end.

## Why this isn't just "reuse the existing chat"

`useChat.js`/`ChatPanel.jsx` send messages over a WebRTC data channel
(`sendData('annotation', {...})`), and that data channel only exists once a guest has an
established `RTCPeerConnection` to the host. Looking at `rooms.js`'s `joinRoom`: a guest in
`approval` mode gets parked in `room.pendingGuests` and the host is notified via a `knock`
message — but no `RTCPeerConnection` is created for them at all until they're actually admitted
(`approvePendingGuest`). A pending guest's only connection to anything is the raw WebSocket to
the signaling server they registered on.

So "let a waiting guest message the host" needs a different transport than in-call chat: relayed
through `relay.js` over that existing WebSocket, the same way `knock` itself already works, not
through a data channel that doesn't exist yet.

## Mechanism

1. **New WS message type: `waiting-chat`.**
   - Guest → host: sent by a guest currently in the `pending-approval` state (their `wsMap` entry
     already has `role: 'guest-pending'` per the existing register flow in `relay.js`). Payload:
     `{ type: 'waiting-chat', text }`.
   - Host → guest: `{ type: 'waiting-chat', text, targetPeerId }`, targeting one specific pending
     guest by peerId.

2. **`relay.js` handling:**
   ```js
   if (type === 'waiting-chat') {
     const meta = wsMap.get(ws)
     if (!meta) return
     if (meta.role === 'guest-pending') {
       const host = getHostSocket(meta.sessionId)
       if (host?.readyState === 1) {
         host.send(JSON.stringify({ type: 'waiting-chat', peerId: meta.peerId, text: sanitizeGuestName(msg.text) /* see note below */ }))
       }
       return
     }
     if (meta.role === 'host' && msg.targetPeerId) {
       // rooms.js needs a way to look up a *pending* guest's ws by peerId —
       // getGuest() only searches admitted guests today.
       const pendingWs = getPendingGuestWs(meta.sessionId, msg.targetPeerId)
       if (pendingWs?.readyState === 1) pendingWs.send(JSON.stringify({ type: 'waiting-chat', text: msg.text }))
       return
     }
   }
   ```
   `sanitizeGuestName` isn't really the right function for chat text (it's tuned for a short
   display name, not a sentence) — this needs its own sanitizer, same idea (strip control
   characters, cap length, no markup injection into the host's UI) but sized for a chat message
   rather than a name. Don't reuse `sanitizeGuestName` verbatim; write a sibling function.

3. **`rooms.js`:** add `getPendingGuestWs(sessionId, peerId)` (reads from the existing
   `room.pendingGuests` map, which already stores `{ ws, timestamp, name }` per pending peerId —
   no new state needed, just a new accessor).

4. **Abuse considerations, specific to this feature:** a pending guest is, by definition, someone
   the host hasn't vetted yet. Unlike in-call chat (sent only by people already admitted), this
   channel is reachable by literally anyone who knocks — including someone the host is about to
   reject. Rate-limit it (e.g. N messages per pending guest per minute, tracked alongside their
   `pendingGuests` entry) so it can't be used to spam the host while they're deciding whether to
   admit someone.

## UI

- **Guest side:** the existing "waiting for approval" screen (wherever that's rendered — likely
  `GuestRoom.jsx`'s `pendingApproval` state) gets a small chat input, using `signalingWrite`
  directly (the same WS `send` function already used for the join handshake) rather than
  `sendData`.
- **Host side:** the knock queue modal gets a small chat thread per pending guest, same
  transport.
- **Scope decision to make explicitly, not assume:** should waiting-room messages carry over
  into the real in-call chat once a guest is admitted, or are they two separate, unconnected
  threads? Simplest and least surprising: keep them separate. A merged history is a nice touch
  but adds real complexity (different message shapes, different transports, stitching two
  histories together in the right order) for a feature whose whole point is being lightweight.

## Rough checklist
- [x] `rooms.js`: `getPendingGuestWs(sessionId, peerId)`, a chat-sized sanitizer (not
      `sanitizeGuestName` reused as-is), and basic per-pending-guest rate limiting.
- [x] `relay.js`: `waiting-chat` handling, both directions.
- [x] `GuestRoom.jsx`: chat input on the pending-approval screen, using `signalingWrite`.
- [x] `HostRoom.jsx`: chat thread per knock-queue entry.
- [x] Explicit decision (and comment in code) on the "separate thread, not merged into in-call
      chat" scoping above, so a future pass doesn't have to re-derive it.

## Implementation notes (added after building this)
- Rate limit landed at 5 messages / 60s per pending guest (`WAITING_CHAT_LIMIT` /
  `WAITING_CHAT_WINDOW_MS` in `rooms.js`), tracked on the existing `pendingGuests` entry
  (`chatWindowStart`/`chatCount`) rather than new top-level state, as the plan suggested.
- Chat text sanitizer caps at 500 chars (vs. 60 for a display name) and strips the same
  markup-capable character set as `sanitizeGuestName`, but is its own function
  (`sanitizeChatText`), not a reuse.
- The "separate thread, not merged" call was made explicitly: see the comment above the
  `waiting-chat` handler in `relay.js`.
- Server-side covered by `test/rooms.test.js` and `test/relay.test.js` (rate limiting,
  sanitization, both-direction relay, and the non-pending-guest-is-ignored case). Not yet
  verified against a real browser/WebSocket end to end — that's the one remaining gap before
  calling this fully done.
