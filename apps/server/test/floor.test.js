// test/floor.test.js — server-side floor-state tracking (rooms.js).
// See docs/floor-mode-plan.md. The actual audio relay happens client-side
// over WebRTC and can't be tested here — this covers only the server's
// bookkeeping: grant/revoke/reassign, and the disconnect safety net that
// clears the floor if its holder leaves.

const test = require('node:test')
const assert = require('node:assert/strict')
const rooms = require('../src/rooms')

function makeRoom(opts = {}) {
  const sessionId = `floor-test-${Math.random().toString(36).slice(2)}`
  const joinCode = `join-${Math.random().toString(36).slice(2)}`
  const shortCode = String(Math.floor(100000 + Math.random() * 900000))
  rooms.createRoom(sessionId, 'host-secret', joinCode, shortCode, opts)
  return sessionId
}

test('getFloor: starts null for a fresh room', () => {
  const sessionId = makeRoom()
  assert.equal(rooms.getFloor(sessionId), null)
})

test('setFloor: grants and reads back', () => {
  const sessionId = makeRoom()
  rooms.setFloor(sessionId, 'guest-a')
  assert.equal(rooms.getFloor(sessionId), 'guest-a')
})

test('setFloor: revoking with null clears it', () => {
  const sessionId = makeRoom()
  rooms.setFloor(sessionId, 'guest-a')
  rooms.setFloor(sessionId, null)
  assert.equal(rooms.getFloor(sessionId), null)
})

test('setFloor: reassigning overwrites the previous holder directly', () => {
  const sessionId = makeRoom()
  rooms.setFloor(sessionId, 'guest-a')
  rooms.setFloor(sessionId, 'guest-b')
  assert.equal(rooms.getFloor(sessionId), 'guest-b')
})

test('leaveRoom: floor holder disconnecting clears the floor server-side (safety net)', () => {
  const sessionId = makeRoom()
  const hostWs = { readyState: 1 }
  const guestWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'host', hostWs, 'host-peer')
  rooms.joinRoom(sessionId, 'guest', guestWs, 'guest-a')
  rooms.setFloor(sessionId, 'guest-a')
  rooms.leaveRoom(guestWs)
  assert.equal(rooms.getFloor(sessionId), null)
})

test('leaveRoom: a non-floor-holder disconnecting does not clear the floor', () => {
  const sessionId = makeRoom()
  const hostWs = { readyState: 1 }
  const guestAWs = { readyState: 1 }
  const guestBWs = { readyState: 1 }
  rooms.joinRoom(sessionId, 'host', hostWs, 'host-peer')
  rooms.joinRoom(sessionId, 'guest', guestAWs, 'guest-a')
  rooms.joinRoom(sessionId, 'guest', guestBWs, 'guest-b')
  rooms.setFloor(sessionId, 'guest-a')
  rooms.leaveRoom(guestBWs)
  assert.equal(rooms.getFloor(sessionId), 'guest-a')
})

test('getFloor: unknown session returns null, does not throw', () => {
  assert.equal(rooms.getFloor('no-such-session'), null)
})

test('setFloor: unknown session returns false, does not throw', () => {
  assert.equal(rooms.setFloor('no-such-session', 'x'), false)
})
