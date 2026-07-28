// relay.js — routes messages between host and guest
const {
  getHostSocket, leaveRoom, joinRoom, getGuest, getGuests, getGuestCount,
  verifyToken, touchRoom, approvePendingGuest, rejectPendingGuest, setPendingGuestName,
  sanitizeGuestName, bindGuestToken, revokeGuestToken, banIp, isIpBanned,
  setFloor, getFloor, getPendingGuestWs, sanitizeChatText, recordWaitingChatMessage,
  promoteCoHost, demoteCoHost, startCall, getLobbyGuests, getRoom,
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

// Pre-launch lobby (docs/pre-launch-lobby-plan.md): sends the current
// lobby roster to every currently-connected lobby guest AND the host (if
// connected), so "see each other arrive" works without anyone needing to
// ask for a refresh. Each recipient gets the same full list — including
// their own entry — client-side filters out "me" using the peerId they
// already have from their own registration response.
function broadcastLobbyRoster(sessionId) {
  const roster = getLobbyGuests(sessionId).map((g) => ({ peerId: g.peerId, name: g.name }))
  const host = getHostSocket(sessionId)
  if (host && host.readyState === 1) {
    host.send(JSON.stringify({ type: 'lobby-roster', guests: roster }))
  }
  for (const g of getLobbyGuests(sessionId)) {
    if (g.ws && g.ws.readyState === 1) {
      g.ws.send(JSON.stringify({ type: 'lobby-roster', guests: roster }))
    }
  }
}

function handleMessage(ws, raw, wsMap) {
  let msg
  try { msg = JSON.parse(raw) } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'invalid-json' }))
    return
  }

  const { type, sessionId, role } = msg

  // ── Registration ────────────────────────────────────────────────────────────
  if (type === 'register') {
    if (!verifyToken(sessionId, msg.token, role)) {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid-token' }))
      ws.close()
      return
    }
    // Defense in depth: the REST join endpoints already refuse to mint a
    // token for a banned IP, but re-check here too in case a token was
    // issued before a ban was applied — design idea §3.1.
    if (role === 'guest' && isIpBanned(sessionId, ws._ip)) {
      ws.send(JSON.stringify({ type: 'error', message: 'banned' }))
      ws.close()
      return
    }
    const peerId = msg.peerId || nanoid()
    const result = joinRoom(sessionId, role, ws, peerId, { guestName: msg.guestName })

    if (result.error) {
      ws.send(JSON.stringify({ type: 'error', message: result.error }))
      ws.close()
      return
    }

    // Bind this token to the peerId it just registered as, so a later
    // host kick can find and revoke exactly this guest's token without
    // touching anyone else's — design idea §3.1.
    if (role === 'guest') bindGuestToken(sessionId, msg.token, peerId)

    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): the room hasn't
    // started yet, so this guest goes into the lobby, not straight into
    // pending-approval/admitted. Distinct message type ('lobby-joined') so
    // the client can render the lobby UI rather than the ordinary
    // "pending-approval" knock screen — they're not knocking on anything,
    // they've just arrived early.
    if (result.lobby) {
      wsMap.set(ws, { sessionId, role: 'guest-lobby', peerId })
      ws.send(JSON.stringify({ type: 'lobby-joined', peerId }))
      broadcastLobbyRoster(sessionId)
      return
    }

    // Approval mode — guest is pending, not yet admitted
    if (result.pending) {
      wsMap.set(ws, { sessionId, role: 'guest-pending', peerId })
      ws.send(JSON.stringify({ type: 'pending-approval', peerId }))
      // Notify host to show the knock modal
      const host = getHostSocket(sessionId)
      if (host && host.readyState === 1) {
        host.send(JSON.stringify({ type: 'knock', peerId, name: sanitizeGuestName(msg.guestName) }))
      }
      return
    }

    wsMap.set(ws, { sessionId, role, peerId })
    // Pre-launch lobby: tell a connecting host whether this room is still
    // in the lobby (not started) or already live, and — if it's a lobby —
    // hand them the current roster right away so they don't have to wait
    // for the next broadcast to see who's already there.
    const room = getRoom(sessionId)
    ws.send(JSON.stringify({ type: 'registered', role, peerId, maxGuests: getGuestCount(sessionId), started: room ? room.started : true }))
    if (role === 'host' && room && !room.started) {
      broadcastLobbyRoster(sessionId)
    }

    if (role === 'guest') {
      const host = getHostSocket(sessionId)
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
    const host = getHostSocket(meta.sessionId)
    if (host && host.readyState === 1) {
      host.send(JSON.stringify({ type: 'knock', peerId: meta.peerId, name: sanitizeGuestName(msg.name) }))
    }
    return
  }

  // ── Waiting-room chat: pending guest ↔ host, before the guest has been
  // admitted (see docs/waiting-room-chat-plan.md). Deliberately a separate
  // thread from in-call chat, not merged into it — in-call chat travels
  // over a WebRTC data channel that doesn't exist yet for a pending guest,
  // and stitching the two histories together (different transports,
  // different message shapes) would add real complexity for a feature
  // whose whole point is being lightweight. That's a deliberate scope
  // decision, not an oversight — a future pass doesn't need to re-derive it.
  if (type === 'waiting-chat') {
    const meta = wsMap.get(ws)
    if (!meta) return

    if (meta.role === 'guest-pending') {
      const limit = recordWaitingChatMessage(meta.sessionId, meta.peerId)
      if (!limit.ok) {
        ws.send(JSON.stringify({ type: 'error', message: limit.error }))
        return
      }
      const host = getHostSocket(meta.sessionId)
      if (host && host.readyState === 1) {
        host.send(JSON.stringify({ type: 'waiting-chat', peerId: meta.peerId, text: sanitizeChatText(msg.text) }))
      }
      return
    }

    if (meta.role === 'host' && msg.targetPeerId) {
      const pendingWs = getPendingGuestWs(meta.sessionId, msg.targetPeerId)
      if (pendingWs && pendingWs.readyState === 1) {
        pendingWs.send(JSON.stringify({ type: 'waiting-chat', text: sanitizeChatText(msg.text) }))
      }
      return
    }
    return
  }

  // ── Pre-launch lobby chat: broadcast among everyone currently in the
  // lobby (lobby guests AND the host, if connected — settled decision: the
  // host CAN join the lobby to chat/greet before starting). This is the
  // genuinely new piece the plan doc flagged as missing: every other
  // broadcast path in this file assumes a host is the hub relaying between
  // guests over WebRTC data channels, but there's no WebRTC at all yet
  // pre-start (no PeerConnections exist until admission). So this goes
  // straight through the server instead, using the raw WS connections
  // rooms.js already tracks in lobbyGuests — the same trick waiting-room
  // chat uses for a single pending guest, generalized here to a broadcast.
  //
  // Simplification worth flagging: unlike waiting-chat, this has no
  // per-sender rate limit yet. A lobby is lower-stakes than an individual
  // knock (no single guest can be spammed out of getting the host's
  // attention — everyone sees the same shared thread), but a determined
  // lobby guest could still flood it. Fine for now; add one if it becomes
  // a real problem.
  if (type === 'lobby-chat') {
    const meta = wsMap.get(ws)
    if (!meta) return
    if (meta.role !== 'guest-lobby' && meta.role !== 'host') return
    const text = sanitizeChatText(msg.text)
    if (!text) return
    const outgoing = JSON.stringify({ type: 'lobby-chat', fromPeerId: meta.role === 'host' ? 'host' : meta.peerId, text })
    if (meta.role !== 'host') {
      const host = getHostSocket(meta.sessionId)
      if (host && host.readyState === 1) host.send(outgoing)
    }
    for (const g of getLobbyGuests(meta.sessionId)) {
      if (meta.role !== 'host' && g.peerId === meta.peerId) continue // don't echo back to the sender
      if (g.ws && g.ws.readyState === 1) g.ws.send(outgoing)
    }
    touchRoom(meta.sessionId)
    return
  }

  // ── Pre-launch lobby: host clicks "Start call." Moves every waiting lobby
  // guest into either the live call (admitted, in arrival order, up to the
  // guest cap) or the ordinary pending-approval knock queue for anyone who
  // doesn't fit under the cap — both settled decisions from the plan doc.
  // Deliberately reuses the EXISTING 'knock'/'peer-joined' message shapes
  // for both outcomes below, rather than inventing new ones — that means
  // zero new host-side UI code is needed to handle overflow guests (they
  // just show up in the knock panel that already exists) or newly-admitted
  // guests (they trigger the same peer-joined → WebRTC-handshake path an
  // ordinary admitted guest already does).
  if (type === 'start-call') {
    const meta = wsMap.get(ws)
    if (!meta || meta.role !== 'host') return
    const result = startCall(meta.sessionId)
    if (!result) return

    for (const peerId of result.admitted) {
      const guestWs = getGuest(meta.sessionId, peerId)
      if (!guestWs) continue
      wsMap.set(guestWs, { sessionId: meta.sessionId, role: 'guest', peerId })
      if (guestWs.readyState === 1) {
        guestWs.send(JSON.stringify({ type: 'session-started', peerId }))
      }
      ws.send(JSON.stringify({ type: 'peer-joined', peerRole: 'guest', peerId, guestCount: getGuestCount(meta.sessionId) }))
    }

    for (const peerId of result.overflow) {
      const guestWs = getPendingGuestWs(meta.sessionId, peerId)
      if (!guestWs) continue
      wsMap.set(guestWs, { sessionId: meta.sessionId, role: 'guest-pending', peerId })
      if (guestWs.readyState === 1) {
        guestWs.send(JSON.stringify({ type: 'pending-approval', peerId }))
      }
      ws.send(JSON.stringify({ type: 'knock', peerId, name: sanitizeGuestName(msg.overflowNames?.[peerId]) }))
    }

    ws.send(JSON.stringify({ type: 'call-started', admittedCount: result.admitted.length, overflowCount: result.overflow.length }))
    touchRoom(meta.sessionId)
    return
  }

  // ── Co-host / assisted moderation (docs/co-host-plan.md, Option A): host
  // promotes/demotes an admitted guest to a moderator badge. This is
  // bookkeeping + audit trail ONLY — it grants no host-only REST/WS
  // authority. The actual kick/mute actions a co-host requests travel over
  // the existing host↔guest WebRTC data channel directly to the host's own
  // browser tab (as a 'cohost-action' data-channel message the host's
  // client re-dispatches to its own handleKick/mute functions), NOT
  // through this signaling server — that's a deliberate scope decision:
  // it reuses the host's already-open connection to that specific guest
  // instead of teaching relay.js a second, parallel authorization path for
  // the same actions the 'kick' handler above already gates on
  // meta.role === 'host'. So there is no 'cohost-action' case here.
  if (type === 'promote-cohost' || type === 'demote-cohost') {
    const meta = wsMap.get(ws)
    if (!meta || meta.role !== 'host') return
    const targetPeerId = msg.peerId
    if (type === 'promote-cohost') promoteCoHost(meta.sessionId, targetPeerId)
    else demoteCoHost(meta.sessionId, targetPeerId)
    touchRoom(meta.sessionId)
    return
  }

  // ── Floor mode: host grants/revokes the floor ──────────────────────
  // Purely server-side bookkeeping + audit trail. The actual audio relay so
  // everyone can hear the floor guest happens client-side over WebRTC (see
  // docs/floor-mode-plan.md) — this doesn't relay anything to guests
  // itself, the host's client does that directly via its data channels.
  if (type === 'floor-grant' || type === 'floor-revoke') {
    const meta = wsMap.get(ws)
    if (!meta || meta.role !== 'host') return
    setFloor(meta.sessionId, type === 'floor-grant' ? msg.peerId : null)
    touchRoom(meta.sessionId)
    return
  }

  // ── Host kicks (and optionally bans) a specific guest ──────────────
  // Server-authoritative version of the old client-only P2P kick — this
  // actually removes the guest from server-side room state and, with
  // ban:true, revokes their specific token and blocks their IP from
  // getting a new one. Design idea §3.1.
  if (type === 'kick') {
    const meta = wsMap.get(ws)
    if (!meta || meta.role !== 'host') return
    const { peerId: targetPeerId, ban } = msg
    const guestWs = getGuest(meta.sessionId, targetPeerId)
    const revoked = revokeGuestToken(meta.sessionId, targetPeerId)
    if (ban && revoked?.ip) banIp(meta.sessionId, revoked.ip)
    // If the guest being kicked currently held the floor, clear that
    // server-side too — the host client handles the actual audio-relay
    // teardown itself (see docs/floor-mode-plan.md), this just keeps the
    // server's record in sync.
    if (getFloor(meta.sessionId) === targetPeerId) setFloor(meta.sessionId, null)
    // Same for co-host status (docs/co-host-plan.md): a kicked guest
    // shouldn't retain a moderator badge, defense-in-depth alongside the
    // host's own client-side cleanup.
    demoteCoHost(meta.sessionId, targetPeerId)
    if (guestWs) {
      if (guestWs.readyState === 1) {
        guestWs.send(JSON.stringify({ type: 'kicked', banned: !!ban }))
      }
      try { guestWs.close() } catch {}
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
        const host = getHostSocket(meta.sessionId)
        if (host && host.readyState === 1) host.send(JSON.stringify(outgoing))
      } else {
        const guest = getGuest(meta.sessionId, targetPeerId)
        if (guest && guest.readyState === 1) guest.send(JSON.stringify(outgoing))
      }
      return
    }

    if (meta.role === 'guest') {
      const host = getHostSocket(meta.sessionId)
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
  } else if (role === 'guest-lobby') {
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a lobby guest
    // leaving should update everyone else's "who's here" view — the whole
    // point of a shared lobby is seeing who's actually present, so a stale
    // roster (someone who left still listed) would be actively misleading,
    // not just a minor staleness bug.
    broadcastLobbyRoster(sessionId)
  }
}

module.exports = { handleMessage, handleClose }
