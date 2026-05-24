// rooms.js — in-memory session registry
const { addAuditEvent, endSessionRecord } = require('./db')

const rooms = new Map()
const MAX_GUESTS_DEFAULT = 20
const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IDLE_TTL_MS = 45 * 60 * 1000
const MIN_DURATION_MS = 15 * 60 * 1000
const MAX_DURATION_MS = 8 * 60 * 60 * 1000

function createRoom(sessionId, token, joinCode, shortCode, options = {}) {
  const now = Date.now()
  const durationMinutes = Math.min(
    Math.max(options.durationMinutes || 120, 15),
    480
  )
  rooms.set(sessionId, {
    sessionId,
    host: null,
    guests: new Map(),           // peerId -> ws (admitted guests)
    pendingGuests: new Map(),    // peerId -> { ws, timestamp, name }
    createdAt: new Date(now),
    lastActive: now,
    token,
    joinCode,
    shortCode,
    locked: false,
    expiresAt: now + durationMinutes * 60 * 1000,
    durationMinutes,
    sessionName: options.sessionName || '',
    maxGuests: options.maxGuests || null,   // null = unlimited
    maxGuestLimit: options.maxGuestLimit || MAX_GUESTS_DEFAULT,
    hostPlan: options.hostPlan || 'free',
    joinMode: options.joinMode || 'open',   // 'open' | 'approval' | 'locked'
    audit: [],
  })
  addAudit(sessionId, 'session-created')
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

function joinRoom(sessionId, role, ws, peerId) {
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
    const cap = room.maxGuests || MAX_GUESTS_DEFAULT
    if (room.guests.size >= cap) return { error: 'room-full' }

    // Approval mode: park the guest in pendingGuests instead of admitting
    if (room.joinMode === 'approval') {
      room.pendingGuests.set(peerId, { ws, timestamp: Date.now(), name: '' })
      touchRoom(sessionId)
      addAudit(sessionId, `guest-knocked:${peerId}`)
      return { pending: true, peerId }
    }

    room.guests.set(peerId, ws)
    touchRoom(sessionId)
    addAudit(sessionId, `guest-joined:${peerId}`)
    return { ok: true }
  }

  return { error: 'invalid-role' }
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
  touchRoom(sessionId)
  addAudit(sessionId, `guest-admitted:${peerId}`)
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
function setPendingGuestName(sessionId, peerId, name) {
  const room = rooms.get(sessionId)
  if (!room) return
  const pending = room.pendingGuests.get(peerId)
  if (pending) pending.name = name
}

function getPendingGuestName(sessionId, peerId) {
  const room = rooms.get(sessionId)
  if (!room) return ''
  return room.pendingGuests.get(peerId)?.name || ''
}

function leaveRoom(ws) {
  for (const [sessionId, room] of rooms.entries()) {
    if (room.host === ws) {
      room.host = null
      addAudit(sessionId, 'host-left')
      if (room.guests.size === 0) rooms.delete(sessionId)
      return { sessionId, role: 'host', room }
    }
    for (const [peerId, guest] of room.guests.entries()) {
      if (guest === ws) {
        room.guests.delete(peerId)
        addAudit(sessionId, `guest-left:${peerId}`)
        if (!room.host || room.host.readyState !== 1) rooms.delete(sessionId)
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
  }
  return null
}

function getPeer(sessionId, role) {
  const room = rooms.get(sessionId)
  if (!room) return null
  return role === 'host' ? null : room.host
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

function verifyToken(sessionId, token) {
  const room = rooms.get(sessionId)
  if (!room) return false
  return room.token === token
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
  addAudit(sessionId, `guest-cap-set:${maxGuests ?? 'unlimited'}`)
  return { ok: true }
}

function touchRoom(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return
  room.lastActive = Date.now()
}

function addAudit(sessionId, event) {
  const room = rooms.get(sessionId)
  if (!room) return
  room.audit.push({ t: Date.now(), event })
  if (room.audit.length > 200) room.audit.shift()
  addAuditEvent(sessionId, event)
}

function getAudit(sessionId) {
  const room = rooms.get(sessionId)
  if (!room) return []
  return room.audit
}

function cleanupRooms() {
  const now = Date.now()
  for (const [sessionId, room] of rooms.entries()) {
    const expired = room.expiresAt && now > room.expiresAt
    const idle = room.lastActive && now - room.lastActive > IDLE_TTL_MS
    if (expired || idle) {
      rooms.delete(sessionId)
      endSessionRecord(sessionId)
    }
  }
}

module.exports = {
  createRoom,
  getRoom,
  getRoomByJoinCode,
  joinRoom,
  leaveRoom,
  getPeer,
  getGuest,
  getGuestCount,
  getGuests,
  verifyToken,
  setLocked,
  setGuestCap,
  touchRoom,
  getAudit,
  cleanupRooms,
  approvePendingGuest,
  rejectPendingGuest,
  setPendingGuestName,
  getPendingGuestName,
  MAX_GUESTS: MAX_GUESTS_DEFAULT,
}
