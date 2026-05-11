// relay.js — routes messages between host and guest
const {
  getPeer, leaveRoom, joinRoom, getGuest, getGuests, getGuestCount,
  verifyToken, touchRoom, approvePendingGuest, rejectPendingGuest, setPendingGuestName,
} = require('./rooms')
const { customAlphabet } = require('nanoid')
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

const RELAY_TYPES = new Set([
  'offer', 'answer', 'ice-candidate',
  'ready',
  'draw', 'clear', 'stroke', 'laser', 'undo',
  'control', 'input', 'meta', 'chat',
  'admin',
  'peer-muted', 'peer-unmuted',
  'reaction', 'cursor', 'screen', 'whiteboard',
  'file-start', 'file-chunk', 'file-end',
  'hand', 'roster', 'spotlight',
  'wb-clear',
])

function handleMessage(ws, raw, wsMap) {
  let msg
  try { msg = JSON.parse(raw) } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'invalid-json' }))
    return
  }

  const { type, sessionId, role } = msg

  // ── Registration ────────────────────────────────────────────────────────────
  if (type === 'register') {
    if (!verifyToken(sessionId, msg.token)) {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid-token' }))
      ws.close()
      return
    }
    const peerId = msg.peerId || nanoid()
    const result = joinRoom(sessionId, role, ws, peerId)

    if (result.error) {
      ws.send(JSON.stringify({ type: 'error', message: result.error }))
      ws.close()
      return
    }

    // Approval mode — guest is pending, not yet admitted
    if (result.pending) {
      wsMap.set(ws, { sessionId, role: 'guest-pending', peerId })
      ws.send(JSON.stringify({ type: 'pending-approval', peerId }))
      // Notify host to show the knock modal
      const host = getPeer(sessionId, 'guest')
      if (host && host.readyState === 1) {
        host.send(JSON.stringify({ type: 'knock', peerId, name: msg.guestName || '' }))
      }
      return
    }

    wsMap.set(ws, { sessionId, role, peerId })
    ws.send(JSON.stringify({ type: 'registered', role, peerId, maxGuests: getGuestCount(sessionId) }))

    if (role === 'guest') {
      const host = getPeer(sessionId, 'guest')
      if (host && host.readyState === 1) {
        host.send(JSON.stringify({ type: 'peer-joined', peerRole: 'guest', peerId, guestCount: getGuestCount(sessionId) }))
      }
    }
    if (role === 'host') {
      for (const [gid, gws] of getGuests(sessionId)) {
        if (gws.readyState === 1) gws.send(JSON.stringify({ type: 'peer-joined', peerRole: 'host', peerId }))
      }
    }
    return
  }

  // ── Knock response from host (approve / reject pending guest) ────────────────
  if (type === 'knock-response') {
    const meta = wsMap.get(ws)
    if (!meta || meta.role !== 'host') return
    const { action, peerId: targetPeerId } = msg

    if (action === 'approve') {
      const guestWs = approvePendingGuest(meta.sessionId, targetPeerId)
      if (!guestWs) return
      // Update wsMap entry for this guest
      wsMap.set(guestWs, { sessionId: meta.sessionId, role: 'guest', peerId: targetPeerId })
      // Tell guest they were admitted
      if (guestWs.readyState === 1) {
        guestWs.send(JSON.stringify({ type: 'admitted', peerId: targetPeerId }))
      }
      // Notify host to proceed with peer-joined
      ws.send(JSON.stringify({ type: 'peer-joined', peerRole: 'guest', peerId: targetPeerId, guestCount: getGuestCount(meta.sessionId) }))
      return
    }

    if (action === 'reject') {
      const guestWs = rejectPendingGuest(meta.sessionId, targetPeerId)
      if (guestWs && guestWs.readyState === 1) {
        guestWs.send(JSON.stringify({ type: 'knock-rejected' }))
        guestWs.close()
      }
      return
    }
    return
  }

  // ── Guest knock (manual re-knock when in pending-approval state) ─────────────
  if (type === 'knock') {
    const meta = wsMap.get(ws)
    if (!meta) return
    const host = getPeer(meta.sessionId, 'guest')
    if (host && host.readyState === 1) {
      host.send(JSON.stringify({ type: 'knock', peerId: meta.peerId, name: msg.name || '' }))
    }
    return
  }

  // ── Relay peer-to-peer messages ───────────────────────────────────────────────
  if (RELAY_TYPES.has(type)) {
    const meta = wsMap.get(ws)
    if (!meta) return
    touchRoom(meta.sessionId)
    const outgoing = { ...msg, fromPeerId: meta.peerId }
    const targetPeerId = msg.targetPeerId

    if (targetPeerId) {
      if (targetPeerId === 'host') {
        const host = getPeer(meta.sessionId, 'guest')
        if (host && host.readyState === 1) host.send(JSON.stringify(outgoing))
      } else {
        const guest = getGuest(meta.sessionId, targetPeerId)
        if (guest && guest.readyState === 1) guest.send(JSON.stringify(outgoing))
      }
      return
    }

    if (meta.role === 'guest') {
      const host = getPeer(meta.sessionId, 'guest')
      if (host && host.readyState === 1) host.send(JSON.stringify(outgoing))
      return
    }

    if (meta.role === 'host') {
      for (const [gid, gws] of getGuests(meta.sessionId)) {
        if (gws.readyState === 1) gws.send(JSON.stringify(outgoing))
      }
      return
    }
    return
  }

  ws.send(JSON.stringify({ type: 'error', message: 'unknown-type' }))
}

function handleClose(ws, wsMap) {
  const result = leaveRoom(ws)
  if (!result) return

  const { sessionId, role, room, peerId } = result
  wsMap.delete(ws)

  if (role === 'guest') {
    if (room.host && room.host.readyState === 1) {
      room.host.send(JSON.stringify({ type: 'peer-left', peerRole: role, peerId, guestCount: room.guests.size }))
    }
  } else if (role === 'host') {
    for (const [gid, gws] of room.guests.entries()) {
      if (gws.readyState === 1) gws.send(JSON.stringify({ type: 'peer-left', peerRole: role, peerId: 'host' }))
    }
  }
}

module.exports = { handleMessage, handleClose }
