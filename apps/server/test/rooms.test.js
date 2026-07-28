// test/rooms.test.js — authorization tests for the host/guest token model.
//
// Covers two things:
//   1. AUDIT.md §1 — a guest-obtained token must never satisfy a host-only
//      check (the original critical bug: guests and hosts shared one secret).
//   2. Design idea §3.1 — guest tokens are now individually issued per
//      browser and individually revocable, rather than one shared secret
//      for the whole room; kicking one guest must not affect any other.
//
// Uses Node's built-in test runner (node:test) — no extra dependency needed.
// Run with: npm test (from apps/server)

const test = require('node:test')
const assert = require('node:assert/strict')
const rooms = require('../src/rooms')

function freshSessionId() {
  return `test-session-${Math.random().toString(36).slice(2)}`
}

function makeRoom(opts = {}) {
  const sessionId = freshSessionId()
  const joinCode = `join-${Math.random().toString(36).slice(2)}`
  const shortCode = String(Math.floor(100000 + Math.random() * 900000))
  rooms.createRoom(sessionId, 'host-secret', joinCode, shortCode, opts)
  return sessionId
}

// ── Host token ────────────────────────────────────────────────────────────

test('verifyToken: host token satisfies a host-role check', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.verifyToken(sessionId, 'host-secret', 'host'), true)
})

test('verifyToken: wrong token entirely is rejected for either role', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.verifyToken(sessionId, 'not-a-real-token', 'host'), false)
  assert.equal(rooms.verifyToken(sessionId, 'not-a-real-token', 'guest'), false)
})

test('verifyToken: unknown session always rejects', () => {
  assert.equal(rooms.verifyToken('no-such-session', 'anything', 'host'), false)
})

// ── Per-guest issued tokens (§1 + design idea §3.1) ─────────────────────────

test('issueGuestToken: mints a token that satisfies a guest-role check', () => {
  const sessionId = makeRoom()
  const guestToken = rooms.issueGuestToken(sessionId, '1.2.3.4')
  assert.ok(guestToken && guestToken.length > 10)
  assert.equal(rooms.verifyToken(sessionId, guestToken, 'guest'), true)
})

test('issueGuestToken: a guest token does NOT satisfy a host-role check (core §1 regression test)', () => {
  const sessionId = makeRoom()
  const guestToken = rooms.issueGuestToken(sessionId, '1.2.3.4')
  // This is exactly the check that /session/:id/lock, /cap, and /audit run.
  assert.equal(rooms.verifyToken(sessionId, guestToken, 'host'), false)
})

test('issueGuestToken: the host token does NOT satisfy a guest-role check', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.verifyToken(sessionId, 'host-secret', 'guest'), false)
})

test('issueGuestToken: two calls for the same room mint two distinct, independently-valid tokens', () => {
  const sessionId = makeRoom()
  const tokenA = rooms.issueGuestToken(sessionId, '1.1.1.1')
  const tokenB = rooms.issueGuestToken(sessionId, '2.2.2.2')
  assert.notEqual(tokenA, tokenB)
  assert.equal(rooms.verifyToken(sessionId, tokenA, 'guest'), true)
  assert.equal(rooms.verifyToken(sessionId, tokenB, 'guest'), true)
})

test('revokeGuestToken: revoking one guest\'s token does not affect another guest\'s token (design idea §3.1)', () => {
  const sessionId = makeRoom()
  const tokenA = rooms.issueGuestToken(sessionId, '1.1.1.1')
  const tokenB = rooms.issueGuestToken(sessionId, '2.2.2.2')
  const wsA = { readyState: 1 }
  const wsB = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', wsA, 'peer-a')
  rooms.joinRoom(sessionId, 'guest', wsB, 'peer-b')
  rooms.bindGuestToken(sessionId, tokenA, 'peer-a')
  rooms.bindGuestToken(sessionId, tokenB, 'peer-b')

  rooms.revokeGuestToken(sessionId, 'peer-a')

  assert.equal(rooms.verifyToken(sessionId, tokenA, 'guest'), false, 'revoked guest token should no longer verify')
  assert.equal(rooms.verifyToken(sessionId, tokenB, 'guest'), true, 'other guest token must be unaffected')
})

test('revokeGuestToken: returns the IP the token was issued to, for ban enforcement', () => {
  const sessionId = makeRoom()
  const token = rooms.issueGuestToken(sessionId, '9.9.9.9')
  const ws = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', ws, 'peer-x')
  rooms.bindGuestToken(sessionId, token, 'peer-x')
  const revoked = rooms.revokeGuestToken(sessionId, 'peer-x')
  assert.equal(revoked.ip, '9.9.9.9')
})

test('revokeGuestToken: no-op (returns null) for a peerId with no bound token', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.revokeGuestToken(sessionId, 'never-joined'), null)
})

// ── IP bans (design idea §3.1) ──────────────────────────────────────────────

test('banIp / isIpBanned: an unbanned IP is not banned', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.isIpBanned(sessionId, '5.5.5.5'), false)
})

test('banIp / isIpBanned: a banned IP is reported as banned', () => {
  const sessionId = makeRoom()
  rooms.banIp(sessionId, '5.5.5.5')
  assert.equal(rooms.isIpBanned(sessionId, '5.5.5.5'), true)
})

test('banIp / isIpBanned: banning one IP does not ban a different IP', () => {
  const sessionId = makeRoom()
  rooms.banIp(sessionId, '5.5.5.5')
  assert.equal(rooms.isIpBanned(sessionId, '6.6.6.6'), false)
})

test('kick+ban flow end-to-end: banned IP cannot get a token accepted, unbanned guest is unaffected', () => {
  const sessionId = makeRoom()
  const badToken = rooms.issueGuestToken(sessionId, '10.0.0.1')
  const goodToken = rooms.issueGuestToken(sessionId, '10.0.0.2')
  const badWs = { readyState: 1 }
  const goodWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', badWs, 'bad-peer')
  rooms.joinRoom(sessionId, 'guest', goodWs, 'good-peer')
  rooms.bindGuestToken(sessionId, badToken, 'bad-peer')
  rooms.bindGuestToken(sessionId, goodToken, 'good-peer')

  // Simulate a host "kick + ban" of bad-peer
  const revoked = rooms.revokeGuestToken(sessionId, 'bad-peer')
  rooms.banIp(sessionId, revoked.ip)

  // Old token is dead, and even a freshly-issued token from that IP is
  // blocked at the IP layer (checked by the caller via isIpBanned before
  // ever minting — this just proves the IP is flagged).
  assert.equal(rooms.verifyToken(sessionId, badToken, 'guest'), false)
  assert.equal(rooms.isIpBanned(sessionId, '10.0.0.1'), true)

  // The other guest is completely unaffected.
  assert.equal(rooms.verifyToken(sessionId, goodToken, 'guest'), true)
  assert.equal(rooms.isIpBanned(sessionId, '10.0.0.2'), false)
})

// ── getHostSocket (§2.2) ─────────────────────────────────────────────────

test('getHostSocket: returns null before a host has registered, not a wrong-role footgun (§2.2)', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.getHostSocket(sessionId), null)
})

test('getHostSocket: returns the host ws once the host has joined', () => {
  const sessionId = makeRoom()
  const fakeHostWs = { readyState: 1 }
  const result = rooms.joinRoom(sessionId, 'host', fakeHostWs, 'host-peer-1')
  assert.equal(result.ok, true)
  assert.equal(rooms.getHostSocket(sessionId), fakeHostWs)
})

// ── Co-host / assisted moderation (docs/co-host-plan.md) ──────────────────

test('promoteCoHost: succeeds for an admitted guest and isCoHost reflects it', () => {
  const sessionId = makeRoom()
  const fakeGuestWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', fakeGuestWs, 'guest-peer-1')
  const ok = rooms.promoteCoHost(sessionId, 'guest-peer-1')
  assert.equal(ok, true)
  assert.equal(rooms.isCoHost(sessionId, 'guest-peer-1'), true)
})

test('promoteCoHost: fails for a peerId that is not an admitted guest (pending or unknown)', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'pending-peer', { guestName: 'A' })
  assert.equal(rooms.promoteCoHost(sessionId, 'pending-peer'), false, 'a still-pending guest cannot be promoted')
  assert.equal(rooms.promoteCoHost(sessionId, 'never-joined'), false, 'an unknown peerId cannot be promoted')
  assert.equal(rooms.isCoHost(sessionId, 'pending-peer'), false)
})

test('demoteCoHost: removes co-host status and returns whether it had been set', () => {
  const sessionId = makeRoom()
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'guest-peer-1')
  rooms.promoteCoHost(sessionId, 'guest-peer-1')
  assert.equal(rooms.demoteCoHost(sessionId, 'guest-peer-1'), true)
  assert.equal(rooms.isCoHost(sessionId, 'guest-peer-1'), false)
  assert.equal(rooms.demoteCoHost(sessionId, 'guest-peer-1'), false, 'demoting an already-non-cohost is a no-op, not an error')
})

test('getCoHostPeerIds: lists all currently promoted peerIds for a room', () => {
  const sessionId = makeRoom()
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-a')
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-b')
  rooms.promoteCoHost(sessionId, 'peer-a')
  rooms.promoteCoHost(sessionId, 'peer-b')
  const ids = rooms.getCoHostPeerIds(sessionId)
  assert.equal(ids.length, 2)
  assert.ok(ids.includes('peer-a') && ids.includes('peer-b'))
})

test('leaveRoom: a departing co-host is cleared from coHostPeerIds (no stale badge on reconnect)', () => {
  const sessionId = makeRoom()
  const guestWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', guestWs, 'guest-peer-1')
  rooms.promoteCoHost(sessionId, 'guest-peer-1')
  rooms.leaveRoom(guestWs)
  assert.equal(rooms.isCoHost(sessionId, 'guest-peer-1'), false)
})

// ── sanitizeGuestName (§2.6) ─────────────────────────────────────────────

test('sanitizeGuestName: strips markup-capable characters (§2.6)', () => {
  const dirty = `<script>alert('x')</script>`
  const clean = rooms.sanitizeGuestName(dirty)
  assert.equal(/[<>&"']/.test(clean), false)
})

test('sanitizeGuestName: caps length at 60 characters', () => {
  const long = 'a'.repeat(500)
  assert.equal(rooms.sanitizeGuestName(long).length, 60)
})

test('sanitizeGuestName: collapses newlines/tabs and trims', () => {
  const messy = '  Alice\n\t Bob  '
  assert.equal(rooms.sanitizeGuestName(messy), 'Alice   Bob')
})

test("joinRoom: a knocking guest's name is sanitized before it is stored (§2.6)", () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const fakeGuestWs = { readyState: 1 }
  const result = rooms.joinRoom(sessionId, 'guest', fakeGuestWs, 'guest-peer-1', { guestName: '<b>Eve</b>' })
  assert.equal(result.pending, true)
  const storedName = rooms.getPendingGuestName(sessionId, 'guest-peer-1')
  assert.equal(/[<>]/.test(storedName), false)
})

// ── Waiting-room chat (docs/waiting-room-chat-plan.md) ────────────────────

test('getPendingGuestWs: returns the ws for a still-pending guest', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const fakeGuestWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', fakeGuestWs, 'pending-peer-1', { guestName: 'Alice' })
  assert.equal(rooms.getPendingGuestWs(sessionId, 'pending-peer-1'), fakeGuestWs)
})

test('getPendingGuestWs: returns null for an admitted (non-pending) guest or unknown peerId', () => {
  const sessionId = makeRoom()
  const fakeGuestWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', fakeGuestWs, 'admitted-peer-1')
  assert.equal(rooms.getPendingGuestWs(sessionId, 'admitted-peer-1'), null)
  assert.equal(rooms.getPendingGuestWs(sessionId, 'no-such-peer'), null)
})

test('sanitizeChatText: strips markup-capable characters', () => {
  const dirty = `<script>alert('x')</script>`
  const clean = rooms.sanitizeChatText(dirty)
  assert.equal(/[<>&"']/.test(clean), false)
})

test('sanitizeChatText: caps length at 500 characters (longer than a display name)', () => {
  const long = 'a'.repeat(2000)
  assert.equal(rooms.sanitizeChatText(long).length, 500)
})

test('sanitizeChatText: collapses newlines/tabs and trims', () => {
  const messy = '  hello\n\t there  '
  assert.equal(rooms.sanitizeChatText(messy), 'hello   there')
})

test('recordWaitingChatMessage: allows messages under the per-minute limit', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'chatty-peer', { guestName: 'Bob' })
  for (let i = 0; i < 5; i++) {
    assert.equal(rooms.recordWaitingChatMessage(sessionId, 'chatty-peer').ok, true)
  }
})

test('recordWaitingChatMessage: blocks a pending guest once they exceed the per-minute limit', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'spammy-peer', { guestName: 'Eve' })
  for (let i = 0; i < 5; i++) rooms.recordWaitingChatMessage(sessionId, 'spammy-peer')
  const sixth = rooms.recordWaitingChatMessage(sessionId, 'spammy-peer')
  assert.equal(sixth.ok, false)
  assert.equal(sixth.error, 'rate-limited')
})

test('recordWaitingChatMessage: rate limits are tracked per pending guest, not globally', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-a', { guestName: 'A' })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-b', { guestName: 'B' })
  for (let i = 0; i < 5; i++) rooms.recordWaitingChatMessage(sessionId, 'peer-a')
  assert.equal(rooms.recordWaitingChatMessage(sessionId, 'peer-a').ok, false)
  assert.equal(rooms.recordWaitingChatMessage(sessionId, 'peer-b').ok, true)
})

test('recordWaitingChatMessage: unknown peerId returns not-found rather than throwing', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const result = rooms.recordWaitingChatMessage(sessionId, 'never-knocked')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'not-found')
})

// ── Pre-launch lobby (docs/pre-launch-lobby-plan.md) ──────────────────

test('createRoom: a scheduled room starts with started:false; a normal room starts with started:true', () => {
  const scheduledId = makeRoom({ scheduled: true })
  const normalId = makeRoom()
  assert.equal(rooms.getRoom(scheduledId).started, false)
  assert.equal(rooms.getRoom(normalId).started, true)
})

test('joinRoom: a guest joining an unstarted room lands in the lobby, not pendingGuests/guests', () => {
  const sessionId = makeRoom({ scheduled: true })
  const result = rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'lobby-peer-1', { guestName: 'Alice' })
  assert.equal(result.lobby, true)
  const room = rooms.getRoom(sessionId)
  assert.equal(room.lobbyGuests.has('lobby-peer-1'), true)
  assert.equal(room.guests.has('lobby-peer-1'), false)
  assert.equal(room.pendingGuests.has('lobby-peer-1'), false)
})

test('joinRoom: the lobby is uncapped even when maxGuests is set low', () => {
  const sessionId = makeRoom({ scheduled: true, maxGuests: 1 })
  const r1 = rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-1')
  const r2 = rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-2')
  const r3 = rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-3')
  assert.equal(r1.lobby, true)
  assert.equal(r2.lobby, true)
  assert.equal(r3.lobby, true)
  assert.equal(rooms.getRoom(sessionId).lobbyGuests.size, 3)
})

test('joinRoom: Approval join mode does not apply to lobby guests (they are not knocking)', () => {
  const sessionId = makeRoom({ scheduled: true, joinMode: 'approval' })
  const result = rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-1')
  assert.equal(result.lobby, true)
  assert.equal(result.pending, undefined)
})

test('getLobbyGuests: lists lobby guests in arrival order', async () => {
  const sessionId = makeRoom({ scheduled: true })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'first', { guestName: 'First' })
  await new Promise((r) => setTimeout(r, 5))
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'second', { guestName: 'Second' })
  const list = rooms.getLobbyGuests(sessionId)
  assert.equal(list.length, 2)
  assert.equal(list[0].peerId, 'first')
  assert.equal(list[1].peerId, 'second')
})

test('startCall: admits lobby guests up to the cap, in arrival order, and sets started:true', async () => {
  const sessionId = makeRoom({ scheduled: true, maxGuests: 2 })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'first')
  await new Promise((r) => setTimeout(r, 5))
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'second')
  await new Promise((r) => setTimeout(r, 5))
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'third')

  const result = rooms.startCall(sessionId)

  assert.deepEqual(result.admitted, ['first', 'second'])
  assert.deepEqual(result.overflow, ['third'])
  const room = rooms.getRoom(sessionId)
  assert.equal(room.started, true)
  assert.equal(room.guests.has('first'), true)
  assert.equal(room.guests.has('second'), true)
  assert.equal(room.pendingGuests.has('third'), true)
  assert.equal(room.lobbyGuests.size, 0)
})

test('startCall: recomputes expiresAt from the actual start time, not from creation/scheduling time', () => {
  const sessionId = makeRoom({ scheduled: true, durationMinutes: 60 })
  const room = rooms.getRoom(sessionId)
  const originalExpiresAt = room.expiresAt
  // Simulate the lobby having sat open for a while before starting.
  room.expiresAt = Date.now() - 1000 // already "expired" under the old lobby expiresAt

  const before = Date.now()
  rooms.startCall(sessionId)
  const after = Date.now()

  const expected = room.durationMinutes * 60 * 1000
  assert.ok(room.expiresAt >= before + expected - 1000 && room.expiresAt <= after + expected + 1000)
  assert.notEqual(room.expiresAt, originalExpiresAt)
})

test('startCall: calling it twice is a safe no-op the second time', () => {
  const sessionId = makeRoom({ scheduled: true })
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'peer-1')
  rooms.startCall(sessionId)
  const second = rooms.startCall(sessionId)
  assert.equal(second.alreadyStarted, true)
  assert.deepEqual(second.admitted, [])
})

test('startCall: unknown session returns null rather than throwing', () => {
  assert.equal(rooms.startCall('no-such-session'), null)
})

test('leaveRoom: a lobby guest disconnecting is removed from lobbyGuests, tagged guest-lobby', () => {
  const sessionId = makeRoom({ scheduled: true })
  const ws = { readyState: 1 }
  rooms.joinRoom(sessionId, 'guest', ws, 'peer-1')
  const result = rooms.leaveRoom(ws)
  assert.equal(result.role, 'guest-lobby')
  assert.equal(rooms.getRoom(sessionId).lobbyGuests.has('peer-1'), false)
})

test('leaveRoom: the host disconnecting from an unstarted room does NOT delete it, even with zero admitted guests', () => {
  const sessionId = makeRoom({ scheduled: true })
  const hostWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'host', hostWs, 'host-peer')
  rooms.joinRoom(sessionId, 'guest', { readyState: 1 }, 'lobby-peer') // a guest is waiting
  rooms.leaveRoom(hostWs)
  // The old behavior (room.guests.size === 0 → delete) would have wiped this
  // room out from under the waiting lobby guest, which is exactly the bug
  // this guard exists to prevent.
  assert.notEqual(rooms.getRoom(sessionId), undefined)
  assert.equal(rooms.getRoom(sessionId).lobbyGuests.has('lobby-peer'), true)
})

test('leaveRoom: the host disconnecting from a normal (started) empty room still deletes it as before', () => {
  const sessionId = makeRoom() // started: true
  const hostWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'host', hostWs, 'host-peer')
  rooms.leaveRoom(hostWs)
  assert.equal(rooms.getRoom(sessionId), undefined)
})

test('cleanupRooms: an unstarted room survives well past the normal 45-minute idle timeout', () => {
  const sessionId = makeRoom({ scheduled: true })
  const room = rooms.getRoom(sessionId)
  room.lastActive = Date.now() - 60 * 60 * 1000 // 1 hour idle — past IDLE_TTL_MS
  rooms.cleanupRooms()
  assert.notEqual(rooms.getRoom(sessionId), undefined, 'a scheduled lobby room should not be swept by the short live-session idle timer')
})

test('cleanupRooms: a normal started room IS deleted once past the 45-minute idle timeout', () => {
  const sessionId = makeRoom() // started: true
  const room = rooms.getRoom(sessionId)
  room.lastActive = Date.now() - 60 * 60 * 1000 // 1 hour idle
  rooms.cleanupRooms()
  assert.equal(rooms.getRoom(sessionId), undefined)
})
