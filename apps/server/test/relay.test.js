// test/relay.test.js — integration tests for relay.js's message handling,
// exercised against the real rooms.js (not mocked) so the token/role/ban
// wiring between the two modules is actually verified end to end, not just
// asserted in isolation. Fake WebSocket objects stand in for real sockets.
//
// Covers: register (host/guest, valid/invalid token, IP ban), the knock/
// approval flow, host kick/ban, peer-to-peer relaying, and handleClose's
// peer-left notification. Uses Node's built-in test runner — no extra
// dependency needed. Run with: npm test (from apps/server)

const test = require('node:test')
const assert = require('node:assert/strict')
const rooms = require('../src/rooms')
const { handleMessage, handleClose } = require('../src/relay')

function freshSessionId() {
  return `relay-test-${Math.random().toString(36).slice(2)}`
}

// A minimal stand-in for a `ws` WebSocket connection: readyState 1 = OPEN,
// send() records what was sent (parsed back to an object for easy
// assertions), close() just flips a flag.
function fakeWs(ip) {
  const ws = {
    readyState: 1,
    sent: [],
    closed: false,
    _ip: ip || '1.2.3.4',
    send(raw) { ws.sent.push(JSON.parse(raw)) },
    close() { ws.closed = true; ws.readyState = 3 },
  }
  return ws
}

function makeRoom(opts = {}) {
  const sessionId = freshSessionId()
  const joinCode = `join-${Math.random().toString(36).slice(2)}`
  const shortCode = String(Math.floor(100000 + Math.random() * 900000))
  rooms.createRoom(sessionId, 'host-secret', joinCode, shortCode, opts)
  return sessionId
}

function registerHost(sessionId, wsMap, ip) {
  const hostWs = fakeWs(ip)
  handleMessage(hostWs, JSON.stringify({ type: 'register', sessionId, role: 'host', token: 'host-secret' }), wsMap)
  return hostWs
}

function registerGuest(sessionId, wsMap, { ip, guestName } = {}) {
  const token = rooms.issueGuestToken(sessionId, ip || '9.9.9.9')
  const guestWs = fakeWs(ip)
  handleMessage(guestWs, JSON.stringify({ type: 'register', sessionId, role: 'guest', token, guestName }), wsMap)
  return { guestWs, token }
}

// ── register: host ──────────────────────────────────────────────────────

test('register: host with the correct hostToken is admitted and notified', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  assert.equal(hostWs.closed, false)
  assert.ok(hostWs.sent.some((m) => m.type === 'registered' && m.role === 'host'))
  assert.equal(wsMap.get(hostWs).role, 'host')
})

test('register: host with a wrong token is rejected and the socket is closed', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = fakeWs()
  handleMessage(hostWs, JSON.stringify({ type: 'register', sessionId, role: 'host', token: 'not-the-token' }), wsMap)
  assert.equal(hostWs.closed, true)
  assert.ok(hostWs.sent.some((m) => m.type === 'error' && m.message === 'invalid-token'))
  assert.equal(wsMap.has(hostWs), false)
})

test('register: a guest-issued token cannot register as host (§1 regression, exercised through relay)', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const guestToken = rooms.issueGuestToken(sessionId, '9.9.9.9')
  const ws = fakeWs()
  handleMessage(ws, JSON.stringify({ type: 'register', sessionId, role: 'host', token: guestToken }), wsMap)
  assert.equal(ws.closed, true)
  assert.ok(ws.sent.some((m) => m.type === 'error' && m.message === 'invalid-token'))
})

// ── register: guest ─────────────────────────────────────────────────────

test('register: guest with a validly issued token is admitted and host is notified', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  assert.equal(guestWs.closed, false)
  assert.ok(guestWs.sent.some((m) => m.type === 'registered' && m.role === 'guest'))
  assert.ok(hostWs.sent.some((m) => m.type === 'peer-joined' && m.peerRole === 'guest'))
})

test('register: guest whose IP has been banned is rejected even with a token minted before the ban', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const bannedIp = '66.66.66.66'
  const token = rooms.issueGuestToken(sessionId, bannedIp)
  rooms.banIp(sessionId, bannedIp)
  const ws = fakeWs(bannedIp)
  handleMessage(ws, JSON.stringify({ type: 'register', sessionId, role: 'guest', token }), wsMap)
  assert.equal(ws.closed, true)
  assert.ok(ws.sent.some((m) => m.type === 'error' && m.message === 'banned'))
})

test('register: guest in a full room gets room-full and is not admitted', () => {
  const sessionId = makeRoom({ maxGuests: 1 })
  const wsMap = new Map()
  registerHost(sessionId, wsMap)
  registerGuest(sessionId, wsMap) // fills the one guest slot
  const { guestWs: secondGuestWs } = registerGuest(sessionId, wsMap)
  assert.equal(secondGuestWs.closed, true)
  assert.ok(secondGuestWs.sent.some((m) => m.type === 'error' && m.message === 'room-full'))
})

// ── knock / approval flow ───────────────────────────────────────────────

test('approval mode: guest register is parked pending and the host receives a knock', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap, { guestName: 'Alice' })
  assert.ok(guestWs.sent.some((m) => m.type === 'pending-approval'))
  const knock = hostWs.sent.find((m) => m.type === 'knock')
  assert.ok(knock)
  assert.equal(knock.name, 'Alice')
})

test('approval mode: host approving a knock admits the guest', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap, { guestName: 'Bob' })
  const knock = hostWs.sent.find((m) => m.type === 'knock')

  handleMessage(hostWs, JSON.stringify({ type: 'knock-response', action: 'approve', peerId: knock.peerId }), wsMap)

  assert.ok(guestWs.sent.some((m) => m.type === 'admitted'))
  assert.equal(rooms.getGuestCount(sessionId), 1)
})

test('approval mode: host rejecting a knock closes the guest socket with knock-rejected', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap, { guestName: 'Eve' })
  const knock = hostWs.sent.find((m) => m.type === 'knock')

  handleMessage(hostWs, JSON.stringify({ type: 'knock-response', action: 'reject', peerId: knock.peerId }), wsMap)

  assert.ok(guestWs.sent.some((m) => m.type === 'knock-rejected'))
  assert.equal(guestWs.closed, true)
  assert.equal(rooms.getGuestCount(sessionId), 0)
})

test('knock: a guest name is sanitized before being relayed to the host (§2.6, exercised through relay)', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  registerGuest(sessionId, wsMap, { guestName: '<img src=x onerror=alert(1)>' })
  const knock = hostWs.sent.find((m) => m.type === 'knock')
  assert.equal(/[<>]/.test(knock.name), false)
})

// ── kick / ban (design idea §3.1) ───────────────────────────────────────

test('kick: an admitted guest is closed, notified, and their token stops working', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs, token } = registerGuest(sessionId, wsMap)
  const peerId = wsMap.get(guestWs).peerId

  handleMessage(hostWs, JSON.stringify({ type: 'kick', peerId, ban: false }), wsMap)

  assert.equal(guestWs.closed, true)
  assert.ok(guestWs.sent.some((m) => m.type === 'kicked' && m.banned === false))
  assert.equal(rooms.verifyToken(sessionId, token, 'guest'), false)
})

test('kick with ban: the guest\'s IP is banned and a fresh token from that IP is rejected at register', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const bannedIp = '77.77.77.77'
  const { guestWs } = registerGuest(sessionId, wsMap, { ip: bannedIp })
  const peerId = wsMap.get(guestWs).peerId

  handleMessage(hostWs, JSON.stringify({ type: 'kick', peerId, ban: true }), wsMap)

  assert.ok(guestWs.sent.some((m) => m.type === 'kicked' && m.banned === true))
  assert.equal(rooms.isIpBanned(sessionId, bannedIp), true)

  // A brand-new token minted for the same IP still exists, but a register
  // attempt from that IP is rejected by relay's own ban check.
  const newToken = rooms.issueGuestToken(sessionId, bannedIp)
  const retryWs = fakeWs(bannedIp)
  handleMessage(retryWs, JSON.stringify({ type: 'register', sessionId, role: 'guest', token: newToken }), wsMap)
  assert.equal(retryWs.closed, true)
  assert.ok(retryWs.sent.some((m) => m.type === 'error' && m.message === 'banned'))
})

test('kick: only the targeted guest is affected, others are untouched', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA, token: tokenA } = registerGuest(sessionId, wsMap, { ip: '1.1.1.1' })
  const { guestWs: guestB, token: tokenB } = registerGuest(sessionId, wsMap, { ip: '2.2.2.2' })
  const peerIdA = wsMap.get(guestA).peerId

  handleMessage(hostWs, JSON.stringify({ type: 'kick', peerId: peerIdA, ban: false }), wsMap)

  assert.equal(guestA.closed, true)
  assert.equal(guestB.closed, false)
  assert.equal(rooms.verifyToken(sessionId, tokenA, 'guest'), false)
  assert.equal(rooms.verifyToken(sessionId, tokenB, 'guest'), true)
})

test('kick: a non-host sending a kick message is ignored', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  registerHost(sessionId, wsMap)
  const { guestWs: attacker } = registerGuest(sessionId, wsMap, { ip: '3.3.3.3' })
  const { guestWs: victim } = registerGuest(sessionId, wsMap, { ip: '4.4.4.4' })
  const victimPeerId = wsMap.get(victim).peerId

  handleMessage(attacker, JSON.stringify({ type: 'kick', peerId: victimPeerId, ban: false }), wsMap)

  assert.equal(victim.closed, false)
})

// ── Co-host / assisted moderation (docs/co-host-plan.md) ──────────────────

test('promote-cohost: host promoting an admitted guest is reflected in rooms.js', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  const peerId = wsMap.get(guestWs).peerId

  handleMessage(hostWs, JSON.stringify({ type: 'promote-cohost', peerId }), wsMap)

  assert.equal(rooms.isCoHost(sessionId, peerId), true)
})

test('demote-cohost: host demoting removes co-host status', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  const peerId = wsMap.get(guestWs).peerId
  rooms.promoteCoHost(sessionId, peerId)

  handleMessage(hostWs, JSON.stringify({ type: 'demote-cohost', peerId }), wsMap)

  assert.equal(rooms.isCoHost(sessionId, peerId), false)
})

test('promote-cohost: a non-host sender is ignored (guest cannot self-promote)', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  const peerId = wsMap.get(guestWs).peerId

  handleMessage(guestWs, JSON.stringify({ type: 'promote-cohost', peerId }), wsMap)

  assert.equal(rooms.isCoHost(sessionId, peerId), false)
})

test('kick: kicking a co-host also demotes them (defense in depth alongside host-side cleanup)', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  const peerId = wsMap.get(guestWs).peerId
  rooms.promoteCoHost(sessionId, peerId)

  handleMessage(hostWs, JSON.stringify({ type: 'kick', peerId, ban: false }), wsMap)

  assert.equal(rooms.isCoHost(sessionId, peerId), false)
})

// ── peer-to-peer relay ──────────────────────────────────────────────────

test('relay: a guest chat message is forwarded to the host with fromPeerId attached', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)
  const guestPeerId = wsMap.get(guestWs).peerId

  handleMessage(guestWs, JSON.stringify({ type: 'chat', sessionId, text: 'hello' }), wsMap)

  const forwarded = hostWs.sent.find((m) => m.type === 'chat')
  assert.ok(forwarded)
  assert.equal(forwarded.fromPeerId, guestPeerId)
  assert.equal(forwarded.text, 'hello')
})

test('relay: host broadcast reaches all admitted guests', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA } = registerGuest(sessionId, wsMap, { ip: '1.1.1.1' })
  const { guestWs: guestB } = registerGuest(sessionId, wsMap, { ip: '2.2.2.2' })

  handleMessage(hostWs, JSON.stringify({ type: 'reaction', sessionId, emoji: '👍' }), wsMap)

  assert.ok(guestA.sent.some((m) => m.type === 'reaction'))
  assert.ok(guestB.sent.some((m) => m.type === 'reaction'))
})

test('relay: an unrecognized message type gets an unknown-type error', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  handleMessage(hostWs, JSON.stringify({ type: 'not-a-real-type' }), wsMap)
  assert.ok(hostWs.sent.some((m) => m.type === 'error' && m.message === 'unknown-type'))
})

test('handleMessage: malformed JSON gets an invalid-json error instead of throwing', () => {
  const wsMap = new Map()
  const ws = fakeWs()
  assert.doesNotThrow(() => handleMessage(ws, '{not valid json', wsMap))
  assert.ok(ws.sent.some((m) => m.type === 'error' && m.message === 'invalid-json'))
})

// ── handleClose ──────────────────────────────────────────────────────────

test('handleClose: guest disconnecting notifies the host with peer-left and an updated guestCount', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)

  handleClose(guestWs, wsMap)

  assert.ok(hostWs.sent.some((m) => m.type === 'peer-left' && m.peerRole === 'guest'))
  assert.equal(rooms.getGuestCount(sessionId), 0)
  assert.equal(wsMap.has(guestWs), false)
})

test('handleClose: host disconnecting notifies all guests', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)

  handleClose(hostWs, wsMap)

  assert.ok(guestWs.sent.some((m) => m.type === 'peer-left' && m.peerRole === 'host'))
})

// ── Waiting-room chat (docs/waiting-room-chat-plan.md) ────────────────────

function registerPendingGuest(sessionId, wsMap, { ip, guestName } = {}) {
  const token = rooms.issueGuestToken(sessionId, ip || '9.9.9.9')
  const guestWs = fakeWs(ip)
  handleMessage(guestWs, JSON.stringify({ type: 'register', sessionId, role: 'guest', token, guestName: guestName || 'Guest' }), wsMap)
  const peerId = wsMap.get(guestWs).peerId
  return { guestWs, peerId }
}

test('waiting-chat: a pending guest\'s message is relayed to the host with their peerId, sanitized', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs, peerId } = registerPendingGuest(sessionId, wsMap, { guestName: 'Alice' })

  handleMessage(guestWs, JSON.stringify({ type: 'waiting-chat', text: '<b>hi there</b>' }), wsMap)

  const forwarded = hostWs.sent.find((m) => m.type === 'waiting-chat')
  assert.ok(forwarded)
  assert.equal(forwarded.peerId, peerId)
  assert.equal(/[<>]/.test(forwarded.text), false)
})

test('waiting-chat: the host can reply to one specific pending guest by peerId, others are unaffected', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA, peerId: peerIdA } = registerPendingGuest(sessionId, wsMap, { ip: '1.1.1.1', guestName: 'A' })
  const { guestWs: guestB } = registerPendingGuest(sessionId, wsMap, { ip: '2.2.2.2', guestName: 'B' })

  handleMessage(hostWs, JSON.stringify({ type: 'waiting-chat', targetPeerId: peerIdA, text: 'be right with you' }), wsMap)

  assert.ok(guestA.sent.some((m) => m.type === 'waiting-chat' && m.text === 'be right with you'))
  assert.equal(guestB.sent.some((m) => m.type === 'waiting-chat'), false)
})

test('waiting-chat: a non-host, non-pending sender (e.g. an already-admitted guest) is ignored', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap) // fully admitted, not pending

  handleMessage(guestWs, JSON.stringify({ type: 'waiting-chat', text: 'hello' }), wsMap)

  assert.equal(hostWs.sent.some((m) => m.type === 'waiting-chat'), false)
})

test('waiting-chat: a pending guest is rate-limited after too many messages', () => {
  const sessionId = makeRoom({ joinMode: 'approval' })
  const wsMap = new Map()
  registerHost(sessionId, wsMap)
  const { guestWs } = registerPendingGuest(sessionId, wsMap, { guestName: 'Spammer' })

  for (let i = 0; i < 5; i++) {
    handleMessage(guestWs, JSON.stringify({ type: 'waiting-chat', text: `msg ${i}` }), wsMap)
  }
  guestWs.sent = []
  handleMessage(guestWs, JSON.stringify({ type: 'waiting-chat', text: 'one too many' }), wsMap)

  assert.ok(guestWs.sent.some((m) => m.type === 'error' && m.message === 'rate-limited'))
})

// ── Pre-launch lobby (docs/pre-launch-lobby-plan.md) ──────────────────

function registerLobbyGuest(sessionId, wsMap, { ip, guestName } = {}) {
  const token = rooms.issueGuestToken(sessionId, ip || '9.9.9.9')
  const guestWs = fakeWs(ip)
  handleMessage(guestWs, JSON.stringify({ type: 'register', sessionId, role: 'guest', token, guestName: guestName || 'Guest' }), wsMap)
  const peerId = wsMap.get(guestWs)?.peerId
  return { guestWs, peerId }
}

test('register: a guest joining an unstarted (scheduled) room gets lobby-joined, not registered/pending-approval', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  const { guestWs } = registerLobbyGuest(sessionId, wsMap, { guestName: 'Alice' })

  assert.ok(guestWs.sent.some((m) => m.type === 'lobby-joined'))
  assert.equal(guestWs.sent.some((m) => m.type === 'registered'), false)
  assert.equal(guestWs.sent.some((m) => m.type === 'pending-approval'), false)
  assert.equal(wsMap.get(guestWs).role, 'guest-lobby')
})

test('register: a connecting host on an unstarted room gets registered with started:false and the existing lobby roster', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  registerLobbyGuest(sessionId, wsMap, { guestName: 'Alice' })

  const hostWs = registerHost(sessionId, wsMap)

  const registered = hostWs.sent.find((m) => m.type === 'registered')
  assert.ok(registered)
  assert.equal(registered.started, false)
  const roster = hostWs.sent.find((m) => m.type === 'lobby-roster')
  assert.ok(roster)
  assert.ok(roster.guests.some((g) => g.name === 'Alice'))
})

test('register: a host on a normal (non-scheduled) room gets started:true and no lobby roster', () => {
  const sessionId = makeRoom()
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const registered = hostWs.sent.find((m) => m.type === 'registered')
  assert.equal(registered.started, true)
  assert.equal(hostWs.sent.some((m) => m.type === 'lobby-roster'), false)
})

test('lobby-chat: a lobby guest\'s message reaches the host and other lobby guests, not itself', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA } = registerLobbyGuest(sessionId, wsMap, { ip: '1.1.1.1', guestName: 'A' })
  const { guestWs: guestB } = registerLobbyGuest(sessionId, wsMap, { ip: '2.2.2.2', guestName: 'B' })

  handleMessage(guestA, JSON.stringify({ type: 'lobby-chat', text: 'hi everyone' }), wsMap)

  assert.ok(hostWs.sent.some((m) => m.type === 'lobby-chat' && m.text === 'hi everyone'))
  assert.ok(guestB.sent.some((m) => m.type === 'lobby-chat' && m.text === 'hi everyone'))
  assert.equal(guestA.sent.some((m) => m.type === 'lobby-chat'), false, 'sender should not receive an echo of their own message')
})

test('lobby-chat: the host can also send into the lobby, reaching every lobby guest', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA } = registerLobbyGuest(sessionId, wsMap, { ip: '1.1.1.1', guestName: 'A' })
  const { guestWs: guestB } = registerLobbyGuest(sessionId, wsMap, { ip: '2.2.2.2', guestName: 'B' })

  handleMessage(hostWs, JSON.stringify({ type: 'lobby-chat', text: 'be right with you all' }), wsMap)

  assert.ok(guestA.sent.some((m) => m.type === 'lobby-chat' && m.fromPeerId === 'host'))
  assert.ok(guestB.sent.some((m) => m.type === 'lobby-chat' && m.fromPeerId === 'host'))
})

test('lobby-chat: text is sanitized', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerLobbyGuest(sessionId, wsMap, { guestName: 'A' })

  handleMessage(guestWs, JSON.stringify({ type: 'lobby-chat', text: '<script>bad()</script>' }), wsMap)

  const forwarded = hostWs.sent.find((m) => m.type === 'lobby-chat')
  assert.ok(forwarded)
  assert.equal(/[<>]/.test(forwarded.text), false)
})

test('lobby-chat: an admitted (non-lobby) guest cannot send into the lobby channel', () => {
  const sessionId = makeRoom() // started, normal room
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs } = registerGuest(sessionId, wsMap)

  handleMessage(guestWs, JSON.stringify({ type: 'lobby-chat', text: 'should not work' }), wsMap)

  assert.equal(hostWs.sent.some((m) => m.type === 'lobby-chat'), false)
})

test('start-call: admits lobby guests within the cap and puts overflow into the existing knock queue', () => {
  const sessionId = makeRoom({ scheduled: true, maxGuests: 1 })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA, peerId: peerIdA } = registerLobbyGuest(sessionId, wsMap, { ip: '1.1.1.1', guestName: 'A' })
  const { guestWs: guestB, peerId: peerIdB } = registerLobbyGuest(sessionId, wsMap, { ip: '2.2.2.2', guestName: 'B' })
  hostWs.sent = []

  handleMessage(hostWs, JSON.stringify({ type: 'start-call' }), wsMap)

  // First-arrived guest (A) is admitted straight into the live call.
  assert.ok(guestA.sent.some((m) => m.type === 'session-started'))
  assert.equal(wsMap.get(guestA).role, 'guest')
  assert.ok(hostWs.sent.some((m) => m.type === 'peer-joined' && m.peerId === peerIdA))

  // Second guest (B) didn't fit under the cap of 1 — falls back into the
  // ordinary knock/approval flow instead of being turned away outright.
  assert.ok(guestB.sent.some((m) => m.type === 'pending-approval'))
  assert.equal(wsMap.get(guestB).role, 'guest-pending')
  assert.ok(hostWs.sent.some((m) => m.type === 'knock' && m.peerId === peerIdB))

  assert.ok(hostWs.sent.some((m) => m.type === 'call-started' && m.admittedCount === 1 && m.overflowCount === 1))
})

test('start-call: a non-host sender is ignored', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  registerHost(sessionId, wsMap)
  const { guestWs } = registerLobbyGuest(sessionId, wsMap, { guestName: 'A' })

  handleMessage(guestWs, JSON.stringify({ type: 'start-call' }), wsMap)

  assert.equal(rooms.getRoom(sessionId).started, false)
})

test('handleClose: a lobby guest disconnecting triggers a roster update to the host and remaining lobby guests', () => {
  const sessionId = makeRoom({ scheduled: true })
  const wsMap = new Map()
  const hostWs = registerHost(sessionId, wsMap)
  const { guestWs: guestA } = registerLobbyGuest(sessionId, wsMap, { ip: '1.1.1.1', guestName: 'A' })
  const { guestWs: guestB } = registerLobbyGuest(sessionId, wsMap, { ip: '2.2.2.2', guestName: 'B' })
  hostWs.sent = []
  guestB.sent = []

  handleClose(guestA, wsMap)

  const hostRoster = hostWs.sent.find((m) => m.type === 'lobby-roster')
  assert.ok(hostRoster)
  assert.equal(hostRoster.guests.some((g) => g.name === 'A'), false)
  const guestBRoster = guestB.sent.find((m) => m.type === 'lobby-roster')
  assert.ok(guestBRoster)
})
