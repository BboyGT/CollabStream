import { create } from 'zustand'

const useSession = create((set, get) => ({
  // Session identity
  sessionId: null,
  role: null, // 'host' | 'guest'
  peerId: null,
  sessionToken: null,
  guestCount: 0,

  // Connection state
  peerConnected: false,
  peerLeft: false,
  signalingConnected: false,

  // Mode
  mode: 'view', // 'view' | 'annotate' | 'laser' | 'control'

  // Streams
  localStream: null,
  remoteStream: null,
  remoteScreenStream: null,
  remoteScreenStreamId: null,
  screenStream: null,

  // Remote screen meta
  remoteMeta: null,

  // Audio
  audioMuted: false,
  remoteAudioMuted: false,

  // Annotation
  annotationColor: '#ef4444',
  annotationSize: 3,
  annotationTool: 'pen',

  // Control
  companionConnected: false,
  controlGranted: false,
  controlToken: null,

  // Spotlight
  spotlight: null,

  // Floor mode — one guest can be granted the floor at a time so everyone
  // (not just the host) can hear them. remoteFloorAudioStream is the
  // separate, second incoming audio stream (guest-side only, distinct from
  // remoteStream which always carries the host). floorPeerId/floorPeerName
  // are used by both host and guest UIs to show "who has the floor" — see
  // docs/floor-mode-plan.md.
  remoteFloorAudioStream: null,
  floorPeerId: null,
  floorPeerName: null,

  // Branding (Phase F)
  branding: { logoUrl: null, accentColor: '#22d3ee' },

  // Auth / plan
  userPlan: 'free',

  // Actions
  setSessionId: (id) => set({ sessionId: id }),
  setRole: (role) => set({ role }),
  setPeerId: (id) => set({ peerId: id }),
  setSessionToken: (t) => set({ sessionToken: t }),
  setGuestCount: (n) => set({ guestCount: n }),
  setPeerConnected: (v) => set({ peerConnected: v }),
  setPeerLeft: (v) => set({ peerLeft: v }),
  setSignalingConnected: (v) => set({ signalingConnected: v }),
  setMode: (mode) => set({ mode }),
  setLocalStream: (s) => set({ localStream: s }),
  setRemoteStream: (s) => set({ remoteStream: s }),
  setRemoteScreenStream: (s) => set({ remoteScreenStream: s }),
  setRemoteScreenStreamId: (id) => set({ remoteScreenStreamId: id }),
  setScreenStream: (s) => set({ screenStream: s }),
  setRemoteMeta: (m) => set({ remoteMeta: m }),
  setAudioMuted: (v) => set({ audioMuted: v }),
  setRemoteAudioMuted: (v) => set({ remoteAudioMuted: v }),
  setAnnotationColor: (c) => set({ annotationColor: c }),
  setAnnotationSize: (s) => set({ annotationSize: s }),
  setAnnotationTool: (t) => set({ annotationTool: t }),
  setCompanionConnected: (v) => set({ companionConnected: v }),
  setControlGranted: (v) => set({ controlGranted: v }),
  setControlToken: (t) => set({ controlToken: t }),
  setSpotlight: (s) => set({ spotlight: s }),
  setRemoteFloorAudioStream: (s) => set({ remoteFloorAudioStream: s }),
  setFloor: (peerId, name) => set({ floorPeerId: peerId, floorPeerName: peerId ? (name || null) : null }),
  setBranding: (b) => set({ branding: b }),
  setUserPlan: (p) => set({ userPlan: p }),
  stopLocalMedia: () => {
    const { localStream, screenStream } = get()
    localStream?.getTracks?.().forEach((track) => track.stop())
    screenStream?.getTracks?.().forEach((track) => track.stop())
    set({ localStream: null, screenStream: null })
  },

  reset: () => set({
    sessionId: null, role: null, peerId: null, sessionToken: null, guestCount: 0,
    peerConnected: false, peerLeft: false, signalingConnected: false,
    mode: 'view', localStream: null, remoteStream: null, remoteScreenStream: null, screenStream: null,
    remoteScreenStreamId: null, remoteMeta: null, audioMuted: false, remoteAudioMuted: false,
    annotationColor: '#ef4444', annotationSize: 3, annotationTool: 'pen',
    companionConnected: false, controlGranted: false, controlToken: null, spotlight: null,
    remoteFloorAudioStream: null, floorPeerId: null, floorPeerName: null,
  }),
}))

export default useSession
