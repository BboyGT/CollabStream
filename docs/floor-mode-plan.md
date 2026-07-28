# Floor mode: let one guest speak to everyone at a time

**Status: core mechanism built, awaiting live testing.** Server-side state tracking, the
host-side WebRTC relay (grant/revoke/late-joiner/disconnect), and the guest-side reception +
playback + UI are all implemented and code-reviewed (see the checklists below for what's
verified vs. reasoned-through). **Nothing in this feature has been run in a real browser with
real audio** — see the Testing checklist near the bottom, which is not optional polish but the
actual verification step before this should be trusted in a real call. Check items off as
they're actually implemented and verified, not when the code is merely written.

## The idea, in one sentence

A guest asks to speak; the host grants the floor; while granted, everyone else in the call can
hear that guest too (not just the host); only one guest holds the floor at a time; the host can
always talk over anyone, at any time, without ever losing their own voice.

## Why this is buildable without new infrastructure

CollabStream's current architecture is a hub: the host holds a direct WebRTC connection to
each guest, and guests never connect to each other (see the topology discussion earlier in
this conversation). Full "everyone hears everyone, anytime" group audio would need the host to
relay *every* guest's audio to *every other* guest simultaneously — real N-way fan-out work
that gets more expensive as the group grows.

Floor mode sidesteps that: at any moment, the host only ever needs to relay **one** guest's
audio out to the others. That cost is constant regardless of whether there are 3 guests or 20.
It fits inside the existing hub model with no new servers, no SFU, no new dependencies.

## The mechanism, precisely

WebRTC lets you take a `MediaStreamTrack` the host is *receiving* from one guest's connection
and attach it as a new sender on a *different* guest's connection — the browser handles this
without re-encoding. Concretely:

1. The host already receives every guest's mic audio as an inbound track on that guest's own
   `RTCPeerConnection` (see `pc.ontrack` in `useWebRTCHost.js`). Nothing new needed here except
   keeping a reference to each guest's inbound audio track, keyed by peerId.
2. **Granting the floor to guest X** = for every *other* connected guest's `RTCPeerConnection`,
   call `pc.addTrack(guestXAudioTrack, someStream)`.
3. **Ending/reassigning the floor** = call `pc.removeTrack(sender)` on those same connections to
   remove it again.
4. Both of those trigger `RTCPeerConnection`'s `onnegotiationneeded` event, which kicks off a
   fresh offer/answer round trip automatically.

**The good news, confirmed by reading the actual code (not assumed):** this renegotiation
handshake already exists and already works generically for any add/remove-track event —
`useWebRTCHost.js`'s `pc.onnegotiationneeded` creates and sends a new offer, and
`useWebRTC.js`'s guest-side `handleSignal` already handles receiving an `offer` at any point
and answering it. Floor mode doesn't need to build the renegotiation plumbing — it already
exists for a different reason (adding local/screen tracks) and this reuses it directly.

**The bug this plan already caught, before it was built:** `useWebRTC.js`'s guest-side
`pc.ontrack` handler for audio currently does this:
```js
if (track.kind === 'audio') {
  const hasVideo = stream.getVideoTracks?.().length > 0
  const current = useSession.getState().remoteStream
  if (!current || hasVideo) {
    setRemoteStream(stream)
  }
}
```
This assumes there is only ever one possible incoming audio source (the host). Once the host's
stream is already set (`current` is truthy) and the new incoming stream has no video
(`hasVideo` is false — exactly what an audio-only floor relay looks like), the condition is
`false || false` and **the new stream is silently dropped**. Without fixing this, the entire
relay mechanism above would work perfectly on the wire and guests still wouldn't hear anything.
This needs its own piece of state (not reusing `remoteStream`) and its own `<audio>` element to
actually play it — see the guest-side checklist below.

## Implementation checklist

### Data model / signaling (`rooms.js`, `relay.js`)
- [x] Track `floorPeerId` (currently null, or one guest's peerId) per room in `rooms.js`, for
      auditability and so the state survives a host page reload — not strictly required for the
      mechanism to work (it can be entirely client-driven, like mute/kick already are), but
      cheap insurance and consistent with how `pendingGuests` etc. are already tracked.
- [x] New WS/data-channel message types: `floor-request` (guest → host), `floor-grant` (host →
      everyone, names who has it), `floor-revoke` (host → everyone, clears it). *(Now fully built,
      including `floor-request`: raising a hand also sends a distinct `floor-request` message
      (`GuestRoom.jsx`), surfaced to the host as its own toast — "🎤 X is requesting the floor" —
      separate from the ordinary hand-raise queue, so it doesn't get lost among plain hand-raises.
      `floor-grant`/`floor-revoke` are delivered to guests over the data channel via
      `hostRTC.broadcast`, not just tracked server-side.)*
- [x] Add `floor-request`/`floor-grant`/`floor-revoke` to relay.js's `RELAY_TYPES` (or handle
      explicitly, matching the pattern already used for `knock`/`kick`) so they route correctly.
      *(Handled explicitly, matching `kick`'s pattern — `floor-grant`/`floor-revoke` are host-only
      WS messages that update `rooms.js` state; they don't need generic peer-to-peer relaying
      since the host's client delivers the actual audio/notification directly.)*
- [x] Log floor grants/revokes to the audit trail (`addAudit`), same as lock/kick/etc. *(Built
      into `setFloor` itself in `rooms.js`, and `leaveRoom`/the `kick` handler both clear
      `floorPeerId` server-side if its holder disconnects or gets kicked — covered by 8 passing
      tests in `test/floor.test.js`.)*

### Host-side (`useWebRTCHost.js`)
- [x] Keep a `floorTrackRef`/similar keyed by peerId → inbound audio `MediaStreamTrack`, set
      whenever `pc.ontrack` fires for that guest (kind === 'audio').
- [x] `grantFloor(peerId)`: for every *other* connected guest's PC, `addTrack()` the floor
      guest's audio track; track the resulting `RTCRtpSender` per (targetPeerId) so it can be
      removed later; update local floor state; broadcast `floor-grant`. *(The addTrack/bookkeeping
      is built. The `broadcast('floor-grant')` data-channel notification to guests is separate
      UI-layer work — see HostRoom.jsx below, not yet done.)*
- [x] `revokeFloor()`: `removeTrack()` those senders on every other guest's PC; clear floor
      state; broadcast `floor-revoke`. *(Same caveat — the mechanism is built, the
      `broadcast('floor-revoke')` notification is still pending UI-layer work.)*
- [x] Reassigning directly from guest A to guest B should revoke A cleanly before/while granting
      B — sequence this explicitly rather than relying on call order, to avoid a moment where
      both are relayed or neither is. *(`grantFloor` always calls `revokeFloor()` first —
      reassignment is atomic from the caller's perspective, one function call.)*
- [x] **Late joiner case:** if a new guest connects while someone already holds the floor,
      `_actuallyCreatePC` for that new guest needs to `addTrack()` the current floor holder's
      audio track at PC-creation time too — otherwise a guest who joins mid-floor never hears
      the person currently speaking until the next grant/revoke cycle.
- [x] **Disconnect case:** if the floor holder disconnects or is kicked while holding the floor,
      auto-revoke (remove the now-dead senders from other guests' PCs) rather than leaving
      dangling senders pointing at a dead track. *(Handled in `closePeer` — also cleans up the
      bookkeeping entry if the disconnecting peer was merely a relay target, not the holder.)*
- [x] Host's own mic is explicitly **not** touched by any of this — per the decision already
      made, the host can always talk over the floor guest, so none of this logic should mute,
      duck, or otherwise touch the host's own outgoing track. *(Confirmed: no changes anywhere
      near `localStream` handling.)*

### Guest-side (`useWebRTC.js`, `GuestRoom.jsx`)
- [x] Fix the `ontrack` guard clause described above so an audio-only stream arriving after the
      host's stream isn't silently discarded. Add a **separate** piece of session state (e.g.
      `remoteFloorAudioStream`) rather than overloading `remoteStream`. *(Done in `useWebRTC.js` +
      `store/session.js`. Correlation with a specific peerId uses a new `expectingFloorPeerRef`,
      armed by calling `prepareFloorAudio(peerId)` — see next item.)*
- [x] Correlate "a new audio-only track just arrived" with "who it belongs to" — `ontrack` alone
      carries no application-level identity. Use the `floor-grant` message (which names the
      peerId/display name) arriving via the data channel to know what the next/concurrent
      audio-only track represents, rather than guessing from the stream itself. *(Fully wired:
      `GuestRoom.jsx`'s `handleDataMessage` calls `prepareFloorAudioRef.current?.(msg.peerId)` on
      `floor-grant` and `clearFloorAudioRef.current?.()` on `floor-revoke`, via the same ref-based
      forward-reference pattern already used for `startShareRef`/`renegotiateRef` in this file,
      since `handleDataMessage` is defined before `useWebRTC()` returns these functions.)*
- [x] Add a second, separate `<audio autoPlay>` element bound to `remoteFloorAudioStream` — you
      cannot play two independent `MediaStream`s through one `srcObject` at once, so the host's
      stream and the floor guest's relayed stream need distinct elements. It should be muted
      and cleared when floor-revoke arrives for the currently-held floor. *(A second `<RemoteAudio>`
      instance — that component was already a clean, reusable stream→`<audio>` wrapper, so no new
      component was needed. Cleared automatically: `clearFloorAudio()` sets the stream back to
      null, and `RemoteAudio` renders nothing when its stream prop is null.)*
- [x] Turn "raise hand" into an explicit floor request where relevant (it already exists as a
      hand-raise queue on the host's side — this reuses that UI rather than adding a second,
      confusingly-similar button) — but change the *meaning*: today "Allow to speak" only
      unmutes that guest for the host; it needs to become "grant the floor" (heard by everyone)
      as a distinct, clearly-labeled action from "unmute for me only," if you want to keep both.
      *(Kept both, as the parenthetical allowed: "Allow" (unmute for host only) and "Give floor"
      (everyone hears them) are separate buttons in the host's guest list, both still triggered
      from the same raised-hand queue — no new guest-facing "request floor" button was added, the
      existing Raise Hand button already covers that intent.)*
- [x] UI indicator so every guest can see who currently holds the floor and why they're suddenly
      hearing someone besides the host (a name badge / "🎤 Guest X is speaking" banner). *(Banner
      on both host and guest, phrased differently for the guest who currently holds it — "You
      have the floor" vs "X has the floor" — using the guest's own `peerId` from the session store.)*

### Enforcement of "one at a time"
- [x] Host UI disables/hides "Grant floor" for other pending requests while one is active,
      requiring an explicit revoke or a reassign action (which internally does revoke+grant as
      one atomic step, not two separate host clicks that could race). *(Built as direct
      reassignment rather than disabling: clicking "Give floor" on a different guest while one
      already holds it works immediately — `grantFloor()` already revokes the previous holder
      first, so this is the one-atomic-step path the plan called out as the alternative to
      disabling, not a second, unhandled way to end up with two floors active.)*
- [ ] Guests muting their own mic while holding the floor should go silent for everyone
      automatically — this should already work for free, since disabling a `MediaStreamTrack`
      propagates to every sender built from it, including the relayed copies. **Verify this
      live**, don't just trust the reasoning.

### Testing checklist (manual — I cannot verify live audio from here)
- [ ] 3-tab test: 1 host + 2 guests. Grant guest A the floor, confirm guest B (not just the
      host) actually hears guest A.
- [ ] Confirm the host can still be heard talking over guest A the whole time.
- [ ] Reassign floor from A to B directly (not via revoke-then-grant as two separate clicks) —
      confirm B is audible to others and A is not, with no overlap or gap glitches.
- [ ] A 3rd guest joins mid-floor — confirm they hear the current floor holder immediately, not
      just starting from the next grant.
- [ ] Floor holder gets kicked/disconnects mid-floor — confirm no errors, no dangling audio, no
      stuck "X is speaking" indicator on other guests' screens.
- [ ] Rapid-fire grant/revoke/reassign clicking — confirm no renegotiation glare/collision
      (overlapping offers) breaks the connection.
- [ ] Floor holder mutes their own mic — confirm they actually go silent for everyone, not just
      for the host.

### Honest risk assessment
This is real, non-trivial WebRTC engineering across ~5 files. The concept is sound and the
renegotiation plumbing already exists, which meaningfully de-risks it — but I have no way to
literally hear the result from here. Audio bugs (silence, echo, a stuck track) are exactly the
category of thing that reads correctly in code and only reveals itself with a real microphone
in a real second browser tab. The testing checklist above is not optional polish — it's the
actual verification this feature needs before anyone trusts it in a real call.

---

# Other features worth considering for a more complete product

Found while auditing the codebase over this conversation, not newly invented for this list.
Each is flagged with how confident I am it's a real gap vs. a suggestion, and roughly how big a
lift it'd be. None of these are built — this is a backlog, not a promise.

- [x] **Persistent whiteboard UI.** Confirmed gap: `apps/server/src/index.js` has a complete,
      working `/api/whiteboards` CRUD API (Business plan) — create, list, load, save strokes,
      delete — and there is no UI anywhere in the web app that calls any of it. A real feature
      that's fully built server-side and completely unreachable. Medium lift (mostly UI work,
      the backend already works). *(BUILT: a "Boards" button in the whiteboard toolbar
      (Business plan only) opens a panel to save-as-new, save-over-current, load, or delete
      saved boards. Loading a board broadcasts it to all connected guests too — clear + replay
      each stroke via the same wire shape addTextStamp already uses, no new message type needed.
      Required exposing `getStrokes()`/`loadStrokes()` from `useAnnotation.js`.)*
- [x] **Active-speaker indicator.** Not present today. Becomes specifically more valuable once
      floor mode ships (so guests instantly see who has the floor without hunting for a banner),
      but useful on its own too (host-side guest tile highlighting whoever's currently talking,
      using audio levels from `getStats()` or the Web Audio API). Small-medium lift. *(BUILT: new
      `useActiveSpeaker.js` hook samples RMS audio level per guest via `AnalyserNode` (no new
      dependency), with a 500ms hold so brief pauses don't flicker the indicator. Guest tiles get
      a green glow while speaking.)*
- [x] **Mute-all / bulk guest controls.** Confirmed: the host can currently only mute guests one
      at a time from the guest list. A single "mute everyone" action is a common ask once
      groups get past a handful of people. Small lift. *(Correction: this was already built —
      `handleMuteAll`/`handleUnmuteAll` and "Mute all"/"Unmute all" buttons already existed in
      `HostRoom.jsx`. This list's original claim was stale/wrong; nothing new was needed here.)*
- [x] **Co-host / backup host.** Confirmed single point of failure: there is exactly one host
      per session, tracked as one `hostToken` and one `room.host` socket. If the host
      disconnects, the room survives (guests aren't kicked) but nobody has host controls until
      the original host reconnects with the same token — there's no way to hand host authority
      to someone else, temporarily or permanently. Real gap for any session where the host might
      drop (mobile network, laptop sleep). Larger lift — touches the token model from `rooms.js`
      §1 fairly directly, so this should be scoped carefully against that. Full plan in
      `docs/co-host-plan.md`, which found a real architectural wrinkle worth flagging up front:
      most host powers only exist inside the original host's specific browser tab (that's where
      the actual WebRTC connections live), so "co-host" splits into two very differently-sized
      features. *(Option A — assisted moderation — BUILT: a promoted guest gets kick/mute
      buttons in their own roster panel; requests travel over the existing host↔guest data
      channel and are re-dispatched by the host's own browser tab, not executed directly by the
      co-host. Server-side covered by `test/rooms.test.js`/`test/relay.test.js`, 62/62 passing.
      Option B — true failover, which would let the room survive the *original* host
      disconnecting — remains unbuilt; it requires minting a second valid host-scoped token,
      which the plan flags as needing its own focused security review given `rooms.js` §1's
      history around exactly that token boundary.)*
- [x] **Waiting-room chat.** Confirmed gap: a guest sitting in the knock/approval queue has zero
      way to message the host ("running 2 min late", "wrong link?") before being admitted or
      rejected. Small-medium lift, reuses the existing chat data-channel pattern conceptually
      but needs a channel that works before a guest is fully admitted. Full plan in
      `docs/waiting-room-chat-plan.md`. Pending guests have no WebRTC data channel at all yet (no
      PeerConnection is created until admission), so this needed a different transport — relayed
      through `relay.js` over the existing WebSocket connection, not the data-channel pattern the
      in-call chat uses. *(BUILT: both directions work — a pending guest can message the host
      from the "waiting for approval" screen, and the host can reply per-pending-guest from the
      knock queue modal. Rate-limited server-side (5 msgs/min per pending guest) and
      sanitized separately from display names. Server-side covered by `test/rooms.test.js`/
      `test/relay.test.js`, part of the same 62/62 passing suite.)*
- [ ] **Live captions / transcription.** Not present. Common competitive feature (the landing
      page comparison table doesn't currently claim it either). Meaningfully larger lift — needs
      either a browser Speech Recognition API integration (free, lower quality, English-centric)
      or a paid transcription service (better quality, real ongoing cost, another vendor
      dependency to manage). **Not built this pass** — full plan in `docs/captions-plan.md`. Even
      the "free" Web Speech API path involves a real disclosure decision that shouldn't be made
      silently: in most current Chrome versions that API sends audio to Google's servers, unlike
      everything else in this app, which is peer-to-peer.
- [ ] **Background blur / virtual background.** Not verified either way — I didn't find it while
      reading the camera pipeline, but I also didn't go looking specifically for it, so treat
      this as "probably absent" rather than confirmed. Common modern expectation. Medium lift
      (real-time video segmentation, meaningful CPU cost on the sender's device). **Not built** —
      full plan in `docs/background-blur-plan.md`. Genuinely risky to improvise: real-time
      segmentation needs a new ML dependency (e.g. MediaPipe Selfie Segmentation) with real
      performance cost that can't be evaluated without a physical device to test on.
- [ ] **Meeting analytics.** Speculative addition, not a found gap — the audit log and dashboard
      already exist; extending them with things like per-guest talk time (which floor mode would
      make genuinely easy to compute) or attendance duration would build naturally on top of
      what's already there. Small-medium lift once floor mode exists. **Not built this pass** —
      genuinely small now that floor mode's audit events (`floor-granted:<peerId>`,
      `floor-revoked`) already carry timestamps in `rooms.js`'s audit log; computing talk-time
      deltas from consecutive grant/revoke pairs and surfacing them on the Dashboard is a natural
      next increment, not a redesign. No dedicated plan doc — small enough to just build next
      time, doesn't need the same up-front design pass as the four above.
- [ ] **Breakout rooms.** Speculative, explicitly flagged as probably out of scope — this is a
      much bigger architectural change (multiple concurrent host-hub groups within one session)
      and shouldn't be scoped casually alongside the smaller items above. **Not built** — full
      plan in `docs/breakout-rooms-plan.md`. The largest item in this whole list: breakout rooms
      need a genuinely second WebRTC topology (mesh, alongside the existing hub) to work well,
      not an extension of the current one — recommended as its own standalone spike before any
      integration work, not an incremental addition.
- [x] **Pre-launch lobby.** Confirmed gap, found from a real usage question: a host who
      schedules a session ahead of time has no way to let invited guests arrive early and wait
      together (with each other, not just individually with the host) before the host actually
      starts the call. Distinct from both waiting-room chat (that's one guest ↔ host, inside an
      already-live session) and "Schedule" (that's just an .ics/calendar-invite generator bolted
      onto an already-running session, not a real pre-start session state). Full plan in
      `docs/pre-launch-lobby-plan.md`. Bigger than it first sounds: touches session *lifecycle*
      (a "scheduled, not yet started" state didn't exist before this), and needed a genuinely new
      broadcast-chat path that doesn't route through a host at all — something no existing relay
      code did before, since every other broadcast path assumes a host is the hub. *(BUILT: lobby
      guests who already waited auto-join the live call with no re-admission once the host
      starts; the guest cap gates only the live call, not the lobby; the session-duration clock
      starts at actual start, not creation time; the host can join and chat in the lobby before
      starting. Overflow guests (exceeding the cap) fall back into the existing knock/approval
      panel with zero new host-side UI needed. Server-side covered by `test/rooms.test.js`/
      `test/relay.test.js`, 86/86 passing. Not built this pass: a Dashboard listing of scheduled-
      but-not-started sessions — "Schedule for later" currently still enters the lobby
      immediately rather than returning to the homepage, since there'd otherwise be no way back
      to it.)*
- [x] **Small polish items already found during the earlier audit, not yet fixed:** the guest-cap
      selector's "Unlimited" option is dead code (never actually offered, since the option list
      never includes `null`); "Business = unlimited session duration" is misleading — sessions
      are capped at 8 hours for every plan in practice. Neither is broken, both are minor label/
      cleanup items worth batching into whatever the next pass through this code is. *(BOTH
      FIXED: removed the dead `n === null` branch from the guest-cap menu in `HostRoom.jsx`;
      corrected `Settings.jsx`'s `PLAN_LIMITS.business.duration` from `'Unlimited'` to `'8 hours'`
      to match what the server actually enforces.)*
