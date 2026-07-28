// rooms.js — in-memory session registry
const crypto = require('crypto')
const { addAuditEvent, endSessionRecord, startSessionRecord } = require('./db')

const rooms = new Map()
const lifecycleHandlers = {
  onSessionStart: null,
  onGuestJoin: null,
  onSessionEnd: null,
}
const MAX_GUESTS_DEFAULT = 20
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_TTL_MS = 45 * 60 * 1000
const MIN_DURATION_MS = 15 * 60 * 1000
const MAX_DURATION_MS = 8 * 60 * 60 * 1000
// Pre-launch lobby (docs/pre-launch-lobby-plan.md). A scheduled-but-not-
// started room needs to survive much longer than a live one's 45-minute
// idle timer — the whole point is a host can create it hours or days
// ahead of time. cleanupRooms() below exempts !room.started rooms from
// IDLE_TTL_MS/expiresAt and uses this instead.
const LOBBY_IDLE_TTL_MS = 24 * 60 * 60 * 1000

function setLifecycleHandlers(handlers = {}) {
  lifecycleHandlers.onSessionStart = typeof handlers.onSessionStart === 'function' ? handlers.onSessionStart : null
  lifecycleHandlers.onGuestJoin = typeof handlers.onGuestJoin === 'function' ? handlers.onGuestJoin : null
  lifecycleHandlers.onSessionEnd = typeof handlers.onSessionEnd === 'function' ? handlers.onSessionEnd : null
}

function notifyGuestJoin(room, peerId) {
  if (!room?.hostId || !lifecycleHandlers.onGuestJoin) return
  lifecycleHandlers.onGuestJoin(room.hostId, room.sessionId, peerId, room.sessionName).catch?.(() => {})
}

function notifySessionEnd(room) {
  if (!room?.hostId || !lifecycleHandlers.onSessionEnd) return
  lifecycleHandlers.onSessionEnd(room.hostId, room.sessionId, room.sessionName).catch?.(() => {})
}

function notifySessionStart(room) {
  if (!room?.hostId || !lifecycleHandlers.onSessionStart) return
  lifecycleHandlers.onSessionStart(room.hostId, room.sessionId, room.sessionName).catch?.(() => {})
}

function updatePeakGuests(room) {
  if (!room) return
  room.peakGuests = Math.max(room.peakGuests || 0, room.guests?.size || 0)
}

function createRoom(sessionId, hostToken, joinCode, shortCode, options = {}) {
  const now = Date.now()
  const durationMinutes = Math.min(
    Math.max(options.durationMinutes || 120, 15),
    480
  )
  // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a `scheduled` room is
  // created with started:false and no meaningful expiresAt yet — the
  // session-length clock (durationMinutes) is only meaningful once the call
  // actually begins, so expiresAt is deliberately left far in the future
  // here and recomputed for real by startCall() below. This was one of the
  // plan doc's open decisions, settled as: the duration clock starts at
  // actual start, not at creation/scheduling time.
  const scheduled = !!options.scheduled
  rooms.set(sessionId, {
    sessionId,
    hostId: options.hostId || null,
    host: null,
    guests: new Map(),           // peerId -> ws (admitted guests)
    pendingGuests: new Map(),    // peerId -> { ws, timestamp, name }
    // Pre-launch lobby guests: peerId -> { ws, name, joinedAt }. Distinct
    // from pendingGuests (which is specifically the Approval-mode knock
    // queue for an already-live session) — lobby guests haven't knocked on
    // anything, they've just arrived early for a session that hasn't
    // started yet. Deliberately uncapped (see joinRoom below) per the plan
    // doc's settled decision: the guest cap gates the live call, not the
    // lobby.
    lobbyGuests: new Map(),
    // Whether the call has actually started. False only for a `scheduled`
    // room until the host explicitly starts it (see startCall()); true
    // immediately for a normal "Start Session" room, preserving all
    // existing behavior for the non-lobby path.
    started: !scheduled,
    createdAt: new Date(now),
    lastActive: now,
    // hostToken gates every host-only REST/WS action — see AUDIT.md §1.
    // Guests never get this. Guests instead each get their own individually
    // issued token (see guestTokens below, design idea §3.1) — there is no
    // single shared guest secret for the room, so revoking one guest's
    // access never affects anyone else.
    hostToken,
    // token -> { createdAt, peerId, ip, revoked }. One entry per browser
    // that has ever hit /api/join/:code or /join/:code for this room.
    guestTokens: new Map(),
    // IPs that have been kicked-and-banned from this room. Guests are
    // anonymous (no accounts), so an IP-address ban is the strongest
    // enforcement available without adding guest auth — not perfect
    // (shared IPs, VPNs), but it stops the common case of a rejected guest
    // simply reloading the join link for a fresh token.
    bannedIps: new Set(),
    joinCode,
    shortCode,
    locked: false,
    expiresAt: scheduled ? now + LOBBY_IDLE_TTL_MS : now + durationMinutes * 60 * 1000,
    durationMinutes,
    sessionName: options.sessionName || '',
    maxGuests: options.maxGuests || null,   // null = unlimited
    maxGuestLimit: options.maxGuestLimit || MAX_GUESTS_DEFAULT,
    hostPlan: options.hostPlan || 'free',
    joinMode: options.joinMode || 'open',   // 'open' | 'approval' | 'locked'
    // Floor mode (design idea §3.1 follow-up, see docs/floor-mode-plan.md):
    // which single guest, if any, is currently granted the floor so
    // everyone — not just the host — can hear them. The actual audio relay
    // happens client-side over WebRTC; this field exists for audit-trail
    // purposes and so floor state is queryable/recoverable, not because the
    // mechanism depends on it.
    floorPeerId: null,
    // Co-host / assisted moderation (see docs/co-host-plan.md, Option A).
    // A co-host is an admitted guest the host has designated as a
    // moderation helper. This set is bookkeeping + audit trail only —
    // it does NOT grant the co-host any host-only REST/WS authority
    // (those all still gate on hostToken). The actual kick/mute actions a
    // co-host requests are re-dispatched by the *host's own browser tab*
    // over its existing WebRTC data channel to that guest, exactly as if
    // the host had clicked the button themselves — see co-host-plan.md's
    // "why this isn't a permissions flag" section for why that's the only
    // architecture that works given the hub-and-spoke topology.
    coHostPeerIds: new Set(),
    peakGuests: 0,
    audit: [],
  })
  addAudit(sessionId, scheduled ? 'session-scheduled' : 'session-created', { hostId: options.hostId || null })
}

function getRoom(sessionId) {
  return rooms.get(sessionId)
}

function getRoomByJoinCode(code) {
  for (const room of rooms.values()) {
    if (room.joinCode === code || room.shortCode === code) return room
  }
  return null
}

function joinRoom(sessionId, role, ws, peerId, options = {}) {
  const room = rooms.get(sessionId)
  if (!room) return { error: 'room-not-found' }
  if (room.locked && role === 'guest') return { error: 'room-locked' }
  if (room.joinMode === 'locked' && role === 'guest') return { error: 'room-locked' }
  if (room.expiresAt && Date.now() > room.expiresAt) return { error: 'session-expired' }

  if (role === 'host') {
    if (room.host && room.host.readyState === 1) return { error: 'room-full' }
    room.host = ws
    touchRoom(sessionId)
    addAudit(sessionId, 'host-joined')
    return { ok: true }
  }

  if (role === 'guest') {
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a guest arriving
    // before the host has started the call goes into lobbyGuests, NOT
    // pendingGuests/guests, and NOT subject to joinMode (Approval mode
    // governs admission into a *live* session; a lobby is neither — it's
    // pre-session, and per the plan doc's settled decision, lobby guests
    // who already waited auto-join once the host starts, they don't get
    // knocked again). Deliberately uncapped — maxGuests gates the live
    // call only, per the same settled decision.
    if (!room.started) {
      room.lobbyGuests.set(peerId, { ws, name: sanitizeGuestName(options.guestName), joinedAt: Date.now() })
      touchRoom(sessionId)
      addAudit(sessionId, `guest-entered-lobby:${peerId}`)
      return { lobby: true, peerId }
    }

    const cap = room.maxGuests || MAX_GUESTS_DEFAULT
    if (room.guests.size >= cap) return { error: 'room-full' }

    // Approval mode: park the guest in pendingGuests instead of admitting
    if (room.joinMode === 'approval') {
      room.pendingGuests.set(peerId, { ws, timestamp: Date.now(), name: sanitizeGuestName(options.guestName) })
      touchRoom(sessionId)
      addAudit(sessionId, `guest-knocked:${peerId}`)
      return { pending: true, peerId }
    }

    room.guests.set(peerId, ws)
    updatePeakGuests(room)
    touchRoom(sessionId)
    addAudit(sessionId, `guest-joined:${peerId}`)
    notifyGuestJoin(room, peerId)
    return { ok: true }
  }

  return { error: 'invalid-role' }
}

// Pre-launch lobby (docs/pre-launch-lobby-plan.md): the host has clicked
// "Start call." Moves every lobbyGuests entry into either `guests`
// (admitted straight into the live call, up to maxGuests, in arrival
// order — settled decision: they already waited, no re-admission) or
// `pendingGuests` for anyone who doesn't fit under the cap (settled
// decision: cap gates the live call, not the lobby, so overflow guests
// fall back to the existing knock/approval flow rather than being turned
// away outright). Also recomputes expiresAt from *now*, since
// durationMinutes represents call length, not how long the lobby sat open
// — settled decision: the duration clock starts at actual start.
// Returns which peerIds landed in which bucket so relay.js can notify each
// one correctly (a lobby guest doesn't know which bucket they'll land in
// until this resolves).
function startCall(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  if (room.started) return { admitted: [], overflow: [], alreadyStarted: true }

  const cap = room.maxGuests || MAX_GUESTS_DEFAULT
  const arrived = Array.from(room.lobbyGuests.entries()).sort((a, b) => a[1].joinedAt - b[1].joinedAt)
  const admitted = []
  const overflow = []

  for (const [peerId, entry] of arrived) {
    if (room.guests.size < cap) {
      room.guests.set(peerId, entry.ws)
      updatePeakGuests(room)
      admitted.push(peerId)
      notifyGuestJoin(room, peerId)
    } else {
      room.pendingGuests.set(peerId, { ws: entry.ws, timestamp: Date.now(), name: entry.name })
      overflow.push(peerId)
    }
  }
  room.lobbyGuests.clear()

  room.started = true
  room.expiresAt = Date.now() + room.durationMinutes * 60 * 1000
  startSessionRecord(sessionId)
  notifySessionStart(room)
  touchRoom(sessionId)
  addAudit(sessionId, `call-started:admitted=${admitted.length},overflow=${overflow.length}`)
  return { admitted, overflow }
}

// Lists everyone currently waiting in the lobby, in arrival order — used
// both to notify a newly-connected host of who's already there, and to
// broadcast lobby-chat/roster updates without needing WebRTC (see
// relay.js's 'lobby-chat' handler).
function getLobbyGuests(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return []
  return Array.from(room.lobbyGuests.entries())
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([peerId, entry]) => ({ peerId, name: entry.name, ws: entry.ws }))
}

// Approve a pending guest — move from pendingGuests → guests and return their ws
function approvePendingGuest(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  const cap = room.maxGuests || MAX_GUESTS_DEFAULT
  if (room.guests.size >= cap) return null
  const pending = room.pendingGuests.get(peerId)
  if (!pending) return null
  room.pendingGuests.delete(peerId)
  room.guests.set(peerId, pending.ws)
  updatePeakGuests(room)
  touchRoom(sessionId)
  addAudit(sessionId, `guest-admitted:${peerId}`)
  notifyGuestJoin(room, peerId)
  return pending.ws
}

// Reject a pending guest — remove from pendingGuests and return their ws
function rejectPendingGuest(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  const pending = room.pendingGuests.get(peerId)
  if (!pending) return null
  room.pendingGuests.delete(peerId)
  addAudit(sessionId, `guest-rejected:${peerId}`)
  return pending.ws
}

// Set pending guest name (sent via register message name field)
// Sanitizes a guest-supplied display name before it's stored/broadcast to
// the host's client — strips characters that would let a name double as
// markup, and caps length. See AUDIT.md §2.6.
function sanitizeGuestName(name) {
  return String(name || '')
    .replace(/[<>&"']/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 60)
}

function setPendingGuestName(sessionId, peerId, name) {
  const room = rooms.get(sessionId)
  if (!room) return
  const pending = room.pendingGuests.get(peerId)
  if (pending) pending.name = sanitizeGuestName(name)
}

function getPendingGuestName(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return ''
  return room.pendingGuests.get(peerId)?.name || ''
}

// Returns the raw ws for a still-pending (not yet admitted) guest, or null.
// getGuest() only searches admitted room.guests — this is the pending-guest
// equivalent, needed so a host can reply to a knocking guest's waiting-room
// chat message before that guest has been let in. See
// docs/waiting-room-chat-plan.md.
function getPendingGuestWs(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  return room.pendingGuests.get(peerId)?.ws || null
}

// Sanitizes a chat message sent over the waiting-room channel (design idea
// in docs/waiting-room-chat-plan.md). Deliberately a sibling of
// sanitizeGuestName, not a reuse of it — a display name and a sentence have
// different shapes (a name is capped at 60 chars; a chat message needs more
// room, but still no markup injection into the host's or guest's UI).
function sanitizeChatText(text) {
  return String(text || '')
    .replace(/[<>&"']/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 500)
}

// Rate limit for waiting-room chat, specific to this channel: a pending
// guest is by definition someone the host hasn't vetted yet (unlike
// in-call chat, which only admitted guests can send), so this is reachable
// by anyone who knocks, including someone about to be rejected. Caps each
// pending guest to WAITING_CHAT_LIMIT messages per WAITING_CHAT_WINDOW_MS,
// tracked on their pendingGuests entry — no new top-level state needed.
const WAITING_CHAT_LIMIT = 5
const WAITING_CHAT_WINDOW_MS = 60 * 1000

function recordWaitingChatMessage(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return { ok: false, error: 'not-found' }
  const pending = room.pendingGuests.get(peerId)
  if (!pending) return { ok: false, error: 'not-found' }
  const now = Date.now()
  if (!pending.chatWindowStart || now - pending.chatWindowStart > WAITING_CHAT_WINDOW_MS) {
    pending.chatWindowStart = now
    pending.chatCount = 0
  }
  if (pending.chatCount >= WAITING_CHAT_LIMIT) return { ok: false, error: 'rate-limited' }
  pending.chatCount += 1
  return { ok: true }
}

function leaveRoom(ws) {
  for (const [sessionId, room] of rooms.entries()) {
    if (room.host === ws) {
      room.host = null
      addAudit(sessionId, 'host-left')
      // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a not-yet-started
      // room always has zero *admitted* guests (nobody's admitted until
      // startCall() runs) — without this guard, the host briefly
      // disconnecting (or just closing the lobby tab to come back later)
      // would delete the whole scheduled session and lose every lobby
      // guest waiting in it, which defeats the entire point of scheduling
      // ahead. A live (started) room keeps its existing behavior exactly.
      if (room.started && room.guests.size === 0) {
        rooms.delete(sessionId)
        endSessionRecord(sessionId, room.peakGuests || 0)
        notifySessionEnd(room)
      }
      return { sessionId, role: 'host', room }
    }
    for (const [peerId, guest] of room.guests.entries()) {
      if (guest === ws) {
        room.guests.delete(peerId)
        addAudit(sessionId, `guest-left:${peerId}`)
        // Safety net: if the peer who just left held the floor, clear it
        // server-side too. The host client is expected to do this itself
        // (see docs/floor-mode-plan.md's disconnect handling), but this
        // keeps the server's own record from going stale if that somehow
        // doesn't happen.
        if (room.floorPeerId === peerId) room.floorPeerId = null
        // Same idea for co-host status (docs/co-host-plan.md) — a
        // disconnected guest shouldn't keep a moderator badge if they
        // reconnect as a fresh peerId later.
        room.coHostPeerIds.delete(peerId)
        if (!room.host || room.host.readyState !== 1) {
          rooms.delete(sessionId)
          endSessionRecord(sessionId, room.peakGuests || 0)
          notifySessionEnd(room)
        }
        return { sessionId, role: 'guest', room, peerId }
      }
    }
    // Also check pending guests
    for (const [peerId, pending] of room.pendingGuests.entries()) {
      if (pending.ws === ws) {
        room.pendingGuests.delete(peerId)
        return { sessionId, role: 'guest-pending', room, peerId }
      }
    }
    // Also check pre-launch lobby guests (docs/pre-launch-lobby-plan.md)
    for (const [peerId, entry] of room.lobbyGuests.entries()) {
      if (entry.ws === ws) {
        room.lobbyGuests.delete(peerId)
        addAudit(sessionId, `guest-left-lobby:${peerId}`)
        return { sessionId, role: 'guest-lobby', room, peerId }
      }
    }
  }
  return null
}

// Returns the host's websocket for a room, or null. There is only ever
// one host per room, so this needs no role parameter (see AUDIT.md §2.2 —
// this used to be getPeer(sessionId, role) with a confusing, backwards
// signature where passing 'host' returned null and 'guest' returned the
// host socket).
function getHostSocket(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  return room.host
}

function getGuest(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  return room.guests.get(peerId) || null
}

function getGuestCount(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return 0
  return room.guests.size
}

function getGuests(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return []
  return Array.from(room.guests.entries())
}

// Verifies a token against the role it claims. Host role checks the single
// hostToken; guest role checks the per-browser guestTokens map and rejects
// anything that's been individually revoked (kicked) — see AUDIT.md §1 and
// design idea §3.1.
function verifyToken(sessionId, token, role) {
  const room = rooms.get(sessionId)
  if (!room || !token) return false
  if (role === 'host') return room.hostToken === token
  if (role === 'guest') {
    const entry = room.guestTokens.get(token)
    return !!entry && !entry.revoked
  }
  return false
}

// Mints a brand-new, individually-revocable guest token for one browser.
// Called every time someone hits /api/join/:code or /join/:code — unlike
// the old single shared guestToken, each caller gets their own secret, so
// kicking one guest never invalidates anyone else's access.
function issueGuestToken(sessionId, ip) {
  const room = rooms.get(sessionId)
  if (!room) return null
  const token = crypto.randomBytes(24).toString('hex')
  room.guestTokens.set(token, { createdAt: Date.now(), peerId: null, ip: ip || null, revoked: false })
  return token
}

// Links an issued guest token to the peerId it registered as, so a later
// kick-by-peerId can find (and revoke) the right token.
function bindGuestToken(sessionId, token, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return
  const entry = room.guestTokens.get(token)
  if (entry) entry.peerId = peerId
}

// Revokes the guest token bound to a given peerId (used by a host kick).
// Returns the token's stored IP (or null) so the caller can decide whether
// to also IP-ban, or null if no matching token was found.
function revokeGuestToken(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  for (const entry of room.guestTokens.values()) {
    if (entry.peerId === peerId) {
      entry.revoked = true
      return { ip: entry.ip }
    }
  }
  return null
}

function banIp(sessionId, ip) {
  const room = rooms.get(sessionId)
  if (!room || !ip) return
  room.bannedIps.add(ip)
}

function isIpBanned(sessionId, ip) {
  const room = rooms.get(sessionId)
  if (!room || !ip) return false
  return room.bannedIps.has(ip)
}

function setLocked(sessionId, locked) {
  const room = rooms.get(sessionId)
  if (!room) return false
  room.locked = locked
  addAudit(sessionId, locked ? 'session-locked' : 'session-unlocked')
  return true
}

function setGuestCap(sessionId, maxGuests) {
  const room = rooms.get(sessionId)
  if (!room) return false
  if (maxGuests === null || maxGuests > room.maxGuestLimit) {
    return { error: 'plan-limit', max: room.maxGuestLimit }
  }
  // Cannot lower cap below current guest count
  if (maxGuests !== null && room.guests.size > maxGuests) return { error: 'cap-too-low', current: room.guests.size }
  room.maxGuests = maxGuests
  addAudit(sessionId, `guest-cap-set:${maxGuests === null ? 'unlimited' : maxGuests}`)
  return { ok: true }
}

// Sets (or clears, with peerId=null) who currently holds the floor. See
// docs/floor-mode-plan.md. Doesn't validate that peerId is an admitted
// guest - that's the caller's (relay.js's) job, matching how other
// host-driven state changes in this file are structured.
function setFloor(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return false
  room.floorPeerId = peerId || null
  addAudit(sessionId, peerId ? `floor-granted:${peerId}` : 'floor-revoked')
  return true
}

function getFloor(sessionId) {
  const room = rooms.get(sessionId)
  return room ? room.floorPeerId : null
}

// Co-host / assisted moderation (docs/co-host-plan.md, Option A). Promoting
// requires the target to already be an admitted guest (not pending, not a
// stranger peerId) — a co-host badge only makes sense for someone actually
// in the call. Demoting is always allowed, including for a peerId that was
// never promoted (no-op, doesn't error).
function promoteCoHost(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room || !room.guests.has(peerId)) return false
  room.coHostPeerIds.add(peerId)
  addAudit(sessionId, `cohost-promoted:${peerId}`)
  return true
}

function demoteCoHost(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return false
  const had = room.coHostPeerIds.delete(peerId)
  if (had) addAudit(sessionId, `cohost-demoted:${peerId}`)
  return had
}

function isCoHost(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return false
  return room.coHostPeerIds.has(peerId)
}

function getCoHostPeerIds(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return []
  return Array.from(room.coHostPeerIds)
}

function touchRoom(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return
  room.lastActive = Date.now()
}

function addAudit(sessionId, event, payload = {}) {
  const room = rooms.get(sessionId)
  if (!room) return
  room.audit.push({ t: Date.now(), event })
  if (room.audit.length > 200) room.audit.shift()
  addAuditEvent(sessionId, event, payload)
}

function getAudit(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return []
  return room.audit
}

function cleanupRooms() {
  const now = Date.now()
  for (const [sessionId, room] of rooms.entries()) {
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a not-yet-started
    // room's expiresAt was already set to LOBBY_IDLE_TTL_MS at creation
    // time (see createRoom), so the normal expired/idle check below
    // already does the right thing without special-casing here — but
    // lastActive only updates on touchRoom() calls (join/leave/chat), and a
    // lobby can legitimately sit with zero activity for a long stretch
    // between a guest arriving and the host eventually starting it. Using
    // expiresAt alone (not the 45-minute IDLE_TTL_MS) for un-started rooms
    // is what actually gives them the long runway.
    const idleLimit = room.started ? IDLE_TTL_MS : LOBBY_IDLE_TTL_MS
    const expired = room.expiresAt && now > room.expiresAt
    const idle = room.lastActive && now - room.lastActive > idleLimit
    if (expired || idle) {
      rooms.delete(sessionId)
      endSessionRecord(sessionId, room.peakGuests || 0)
      notifySessionEnd(room)
    }
  }
}

function endRoom(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return null
  rooms.delete(sessionId)
  endSessionRecord(sessionId, room.peakGuests || 0)
  notifySessionEnd(room)
  return room
}

module.exports = {
  createRoom,
  setLifecycleHandlers,
  getRoom,
  getRoomByJoinCode,
  joinRoom,
  leaveRoom,
  getHostSocket,
  getGuest,
  getGuestCount,
  getGuests,
  verifyToken,
  issueGuestToken,
  bindGuestToken,
  revokeGuestToken,
  banIp,
  isIpBanned,
  setLocked,
  setGuestCap,
  setFloor,
  getFloor,
  promoteCoHost,
  demoteCoHost,
  isCoHost,
  getCoHostPeerIds,
  touchRoom,
  getAudit,
  cleanupRooms,
  endRoom,
  approvePendingGuest,
  rejectPendingGuest,
  setPendingGuestName,
  getPendingGuestName,
  sanitizeGuestName,
  getPendingGuestWs,
  sanitizeChatText,
  recordWaitingChatMessage,
  startCall,
  getLobbyGuests,
  MAX_GUESTS: MAX_GUESTS_DEFAULT,
}
