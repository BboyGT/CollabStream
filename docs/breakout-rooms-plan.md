# Breakout rooms: plan

**Status: planning only.** This is the largest of the five deferred items — a genuine
multi-week architectural project, not a feature to bolt onto the existing hub model. This
document exists to scope it honestly, not to talk anyone out of building it.

## Why this is a different kind of hard than the other four

Every other feature in this backlog fits inside the existing hub-and-spoke topology (host holds
one connection per guest, guests never connect to each other). Breakout rooms fundamentally
don't: splitting guests into small sub-groups that can talk among themselves means **some new
set of direct connections has to exist between people who currently have no connection to each
other at all.** That's not an extension of the current architecture, it's a second topology
running alongside it.

## The central design question: who's the hub inside a breakout room?

**Option A — main host stays in every breakout room's connections too.**
Rejected on inspection: this means the host's browser needs connections to every guest in every
breakout group simultaneously — strictly *more* total connections than today, not fewer. Defeats
the entire point of splitting into smaller groups (reducing per-person connection load), and the
host's upload bandwidth (already the bottleneck in the current model) gets worse, not better.

**Option B — a sub-host per breakout room** (one guest per group becomes a mini-hub for that
group). This is architecturally the same problem as the co-host/backup-host plan's Option B
(true host handoff) — establishing new `RTCPeerConnection`s from scratch, live, for someone who
wasn't previously a hub — except it needs to happen *N times simultaneously* (once per breakout
room) rather than once. Whatever complexity host handoff has, this multiplies it.

**Option C — true mesh within each breakout room.** Every participant in a given breakout room
connects directly to every other participant *in that same room* — no hub at all for the
sub-group. This is viable specifically *because* breakout groups are small (typically 3-6
people), which is exactly the range where full mesh is practical (see the earlier
"why full mesh doesn't scale past ~6 people" discussion in this project — breakout rooms are
naturally sized to stay inside that limit). This avoids the "who's the hub" question entirely for
sub-groups, at the cost of using a genuinely different connection topology (mesh) than the main
session (hub) — meaning two different pieces of signaling/connection-management logic need to
coexist, not one generalized to cover both cases.

**Recommendation: Option C.** It's the only one of the three that doesn't just relocate the same
hard problem (host handoff) somewhere else or make the existing bottleneck worse.

## What Option C actually requires, at a rough sketch level

1. **Group membership state.** `rooms.js` needs a concept of breakout groups nested inside a
   session: something like `room.breakoutGroups: Map<groupId, Set<peerId>>`, plus which group
   (if any) each connected guest currently belongs to.

2. **A second signaling path for mesh connections.** Today, `relay.js`'s offer/answer/
   ice-candidate handling assumes messages are always guest↔host. Mesh signaling needs
   guest↔guest offer/answer/ICE exchange *within a group*, relayed through the server the same
   way, but addressed differently (by peerId within a group, not always "the host"). This is a
   real, non-trivial extension of `relay.js`'s routing logic, not a small patch.

3. **Connection lifecycle transitions.** When a guest is assigned to a breakout room, their
   existing hub connection to the main host needs to pause or close (should the host still see/
   hear them during a breakout, typically no in real conferencing products — breakouts are
   private), and new mesh connections to their groupmates need to be established. When the
   breakout ends, the reverse: tear down mesh connections, re-establish or resume the hub
   connection to the host. Each of those four transitions is its own piece of real engineering,
   and they need to work correctly even if a guest's browser is slow, drops a connection
   mid-transition, or the host ends the breakout early.

4. **Host visiting a room.** The host "joining" a breakout room to check in means the host's
   browser becomes an *additional* mesh participant in that specific group temporarily — a
   third kind of connection-lifecycle transition, distinct from both the normal hub connection
   and a guest's mesh participation.

5. **Everything that currently assumes "the host" is a single hub breaks in a breakout room.**
   Floor mode, whiteboard sync, chat targeting, recording — all of it is built around the
   host-as-hub model. None of it automatically works inside a mesh sub-group; each would need
   its own decision about whether/how it applies during a breakout (e.g. is there a "floor" per
   breakout room? Does the whiteboard follow you into a breakout or stay with the main room?).
   This isn't a checklist of small fixes — it's a second pass through most of the features this
   project has already built, deciding what they mean in a second topology.

6. **UX/product surface, not just plumbing:** how are rooms created (fixed count, host-picked
   size, random vs. manual assignment)? Timer and auto-return? Can a guest request to switch
   rooms, or move back to the main room early? A "broadcast to all rooms" message from the host?
   None of this is decided here on purpose — it's real product design, not an engineering detail.

## Recommendation

Don't scope this as an incremental addition to the current codebase. If this is wanted, the
right first step is a **standalone spike**: build and test the mesh-signaling piece (item 2
above) in isolation — a small proof-of-concept where 3-4 peers connect directly to each other
via the existing signaling server, with no breakout-room product logic around it yet — to
validate the approach actually works cleanly before touching the main session model at all. That
spike is itself a real, multi-day undertaking, separate from and before the rest of this list.

## Rough checklist (deliberately not detailed further — see the spike recommendation above)
- [ ] Standalone mesh-signaling proof of concept (3-4 peers, no product logic), as its own
      first step before anything else on this list.
- [ ] `rooms.js` breakout-group membership state.
- [ ] `relay.js` mesh-mode offer/answer/ICE routing, distinct from today's always-to-host routing.
- [ ] Connection lifecycle: join breakout (pause/close hub, open mesh), leave breakout (close
      mesh, resume hub), host visiting a room, host ending a breakout for everyone.
- [ ] Per-feature decisions for floor mode, whiteboard, chat, recording: what do they mean (if
      anything) inside a breakout room — treat each as its own small design question, not an
      assumption that they "just work."
- [ ] Product/UX decisions: room creation/assignment, timers, auto-return, early return,
      cross-room broadcast from host.
