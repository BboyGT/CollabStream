// webrtc.js — RTCPeerConnection factory with TURN config

const STUN_URLS = (import.meta.env.VITE_STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const TURN_URLS = (import.meta.env.VITE_TURN_URLS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const ICE_SERVERS = [
  ...(STUN_URLS.length ? [{ urls: STUN_URLS }] : []),
  ...(TURN_URLS.length ? [{
    urls: TURN_URLS,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  }] : []),
]

export function createPeerConnection() {
  return new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
  })
}

// Add all tracks from a MediaStream to the peer connection
export function addStreamTracks(pc, stream) {
  stream.getTracks().forEach((track) => pc.addTrack(track, stream))
}

// Replace an existing track (e.g. screen share swap)
export function replaceTrack(pc, oldTrack, newTrack) {
  const sender = pc.getSenders().find((s) => s.track === oldTrack)
  if (sender) sender.replaceTrack(newTrack)
}
