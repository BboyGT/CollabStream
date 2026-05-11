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
  setBranding: (b) => set({ branding: b }),
  setUserPlan: (p) => set({ userPlan: p }),

  reset: () => set({
    sessionId: null, role: null, peerId: null, sessionToken: null, guestCount: 0,
    peerConnected: false, peerLeft: false, signalingConnected: false,
    mode: 'view', localStream: null, remoteStream: null, remoteScreenStream: null, screenStream: null,
    remoteScreenStreamId: null, remoteMeta: null, audioMuted: false, remoteAudioMuted: false,
    annotationColor: '#ef4444', annotationSize: 3, annotationTool: 'pen',
    companionConnected: false, controlGranted: false, controlToken: null, spotlight: null,
  }),
}))

export default useSession
