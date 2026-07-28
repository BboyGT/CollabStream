import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSession from '../store/session.js'
import useSignaling from '../hooks/useSignaling.js'
import useWebRTC from '../hooks/useWebRTC.js'
import useScreenShare, { SHARE_QUALITIES } from '../hooks/useScreenShare.js'
import useAudio from '../hooks/useAudio.js'
import useAnnotation from '../hooks/useAnnotation.js'
import useControl from '../hooks/useControl.js'
import useChat from '../hooks/useChat.js'
import useCaptions from '../hooks/useCaptions.js'
import ScreenView from '../components/ScreenView.jsx'
import VideoFeed from '../components/VideoFeed.jsx'
import VideoTile from '../components/VideoTile.jsx'
import ModeBadge from '../components/ModeBadge.jsx'
import AnnotationToolbar from '../components/AnnotationToolbar.jsx'
import AudioControls from '../components/AudioControls.jsx'
import RemoteAudio from '../components/RemoteAudio.jsx'
import CaptionsOverlay from '../components/CaptionsOverlay.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import WhiteboardToolbar from '../components/WhiteboardToolbar.jsx'
import { verifySession } from '../lib/session.js'
import { apiUrl } from '../lib/api.js'
import MediaPermissionScreen from '../components/MediaPermissionScreen.jsx'
import useSnapshot from '../hooks/useSnapshot.js'
import useNetworkQuality from '../hooks/useNetworkQuality.js'
import NetworkBadge from '../components/NetworkBadge.jsx'
import OnboardingTips from '../components/OnboardingTips.jsx'
import HelpGuide from '../components/HelpGuide.jsx'
import CreatorSignature from '../components/CreatorSignature.jsx'
import Baton from '../components/Baton.jsx'
import { flags } from '../lib/flags.js'
import { playChatMessage } from '../lib/sounds.js'

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '👏', '🔥']

function SignalingBanner({ signalingConnected, retryCount, manualRetry, maxRetries }) {
  const [dismissed, setDismissed] = useState(false)
  const hideTimer = useRef(null)
  useEffect(() => {
    if (signalingConnected) hideTimer.current = setTimeout(() => {}, 1000)
    return () => clearTimeout(hideTimer.current)
  }, [signalingConnected])
  if (dismissed || signalingConnected) return null
  const failed = retryCount > maxRetries - 1
  return (
    <div className={`banner-enter absolute top-0 left-0 right-0 z-40 flex items-center gap-2 px-4 py-2 text-xs font-mono ${failed ? 'bg-red-950/70 border-b border-red-800 text-red-200' : 'bg-amber-950/70 border-b border-amber-800 text-amber-200'}`}>
      {failed
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        : <div className="spinner" />}
      <span className="flex-1">{failed ? 'Server unreachable. Is the signaling server running on :3001?' : retryCount === 0 ? 'Connecting to server\u2026' : `Reconnecting\u2026 (attempt ${retryCount}/${maxRetries})`}</span>
      {failed && <button onClick={manualRetry} className="px-2 py-1 rounded bg-red-900 border border-red-700 text-red-200 hover:bg-red-800 text-xs font-mono">Retry</button>}
      <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100 px-1">&#x2715;</button>
    </div>
  )
}

export default function GuestRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const pointerRef = useRef(null)
  const videoRef = useRef(null)

  const [dataChannels, setDataChannels] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [locked, setLocked] = useState(false)
  const [mediaError, setMediaError] = useState(null)
  const [controlDenied, setControlDenied] = useState(false)
  const [name, setName] = useState(() => localStorage.getItem('cs_name') || null)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [handRaised, setHandRaised] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [roster, setRoster] = useState([])
  const [rosterCount, setRosterCount] = useState(0)
  // Co-host / assisted moderation (see docs/co-host-plan.md, Option A). Set
  // from the roster broadcast's per-guest `cohost` flag — this guest's own
  // moderator status, derived rather than tracked independently, so it can
  // never drift from what the host actually granted.
  const [isCoHost, setIsCoHost] = useState(false)
  const [shareRequested, setShareRequested] = useState(false)
  const [shareDenied, setShareDenied] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const [shareQuality, setShareQuality] = useState(SHARE_QUALITIES[0])
  const [fitMode, setFitMode] = useState(() => window.matchMedia?.('(max-width: 768px)').matches ? 'cover' : 'contain')
  const [whiteboard, setWhiteboard] = useState(false)
  const [wbStrokeWidth, setWbStrokeWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  const textInputRef = useRef(null)
  const [reactions, setReactions] = useState([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [waitingLong, setWaitingLong] = useState(false)

  // Knock/approval
  const [joinMode, setJoinMode] = useState('open')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [knockRejected, setKnockRejected] = useState(false)
  const [hasKnocked, setHasKnocked] = useState(false)
  const [admitted, setAdmitted] = useState(false)

  // Waiting-room chat (see docs/waiting-room-chat-plan.md) — a separate
  // thread from in-call chat, sent over the raw signaling WebSocket via
  // signalingWrite rather than a WebRTC data channel, since no data channel
  // exists yet for a guest who hasn't been admitted.
  const [waitingMessages, setWaitingMessages] = useState([])
  const [waitingChatInput, setWaitingChatInput] = useState('')

  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). null = not yet known
  // (assume live, matching HostRoom.jsx's identical reasoning), false =
  // genuinely in the lobby (host hasn't started yet), true = live.
  const [sessionStarted, setSessionStarted] = useState(null)
  const [lobbyGuests, setLobbyGuestsState] = useState([])
  const lobbyGuestsRef = useRef([])
  function setLobbyGuests(guests) { lobbyGuestsRef.current = guests; setLobbyGuestsState(guests) }
  const [lobbyMessages, setLobbyMessages] = useState([])
  const [lobbyChatInput, setLobbyChatInput] = useState('')

  // Leave confirmation
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)

  // Kicked/banned by host (design idea §3.1) — { banned: bool } once removed
  const [removed, setRemoved] = useState(null)

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDock, setChatDock] = useState(() => { try { return localStorage.getItem('cs_chat_dock') || 'floating' } catch { return 'floating' } })
  const [unreadCount, setUnreadCount] = useState(0)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [captions, setCaptions] = useState([])

  // Focus mode
  const [focusMode, setFocusMode] = useState(false)
  const [focusHint, setFocusHint] = useState(false)

  // Noise suppression
  const [noiseSupp, setNoiseSupp] = useState(true)

  // Pre-join lobby (redesign screen — previously the app had no
  // "confirm before you're actually seen/heard" step at all; a guest's
  // camera/mic went live and WebRTC negotiation began automatically the
  // moment permission was granted). `joined` gates that moment behind an
  // explicit "Join now" click; the camera/mic are still requested early
  // (below) so the preview has something real to show.
  const [joined, setJoined] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  useEffect(() => { if (name && !nameDraft) setNameDraft(name) }, [name])
  const [micEnabledPreview, setMicEnabledPreview] = useState(true)
  const [cameraDevices, setCameraDevices] = useState([])
  const [micDevices, setMicDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicId, setSelectedMicId] = useState('')

  const {
    setSessionId, setRole, setLocalStream, setSessionToken, localStream,
    remoteStream, remoteScreenStream, mode, setMode,
    setControlGranted, setControlToken,
    peerConnected, signalingConnected, peerLeft, setPeerLeft,
    annotationColor, annotationTool,
    setAnnotationColor, setAnnotationSize, setAnnotationTool,
    screenStream, setRemoteScreenStreamId, setRemoteScreenStream,
    stopLocalMedia,
    // Floor mode (see docs/floor-mode-plan.md). peerId is this guest's own
    // assigned id (set by useSignaling.js from the 'registered' message),
    // used to tell "I have the floor" apart from "someone else does."
    remoteFloorAudioStream, floorPeerId, floorPeerName, setFloor, peerId,
  } = useSession()

  useEffect(() => {
    if (!localStream) return
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setCameraDevices(devices.filter((d) => d.kind === 'videoinput'))
      setMicDevices(devices.filter((d) => d.kind === 'audioinput'))
    }).catch(() => {})
  }, [localStream])

  // Device switching for the pre-join preview. Builds a fresh MediaStream
  // combining the newly-picked track with whichever OTHER track (audio or
  // video) was already in use, since setLocalStream needs a new object
  // reference to trigger a re-render — mutating the existing stream in
  // place wouldn't. Scoped to pre-join use: once actually connected,
  // swapping a track this way wouldn't propagate to the peer connection
  // without an explicit RTCRtpSender.replaceTrack + renegotiation, which
  // this function doesn't do.
  async function switchDevice(kind, deviceId) {
    if (!deviceId) return
    try {
      const constraints = kind === 'video'
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0]
      const otherTrack = kind === 'video' ? localStream?.getAudioTracks()[0] : localStream?.getVideoTracks()[0]
      const oldTrack = kind === 'video' ? localStream?.getVideoTracks()[0] : localStream?.getAudioTracks()[0]
      oldTrack?.stop()
      setLocalStream(otherTrack ? new MediaStream([newTrack, otherTrack]) : new MediaStream([newTrack]))
      if (kind === 'video') setSelectedCameraId(deviceId); else setSelectedMicId(deviceId)
    } catch {}
  }

  function toggleMicPreview() {
    const track = localStream?.getAudioTracks?.()[0]; if (!track) return
    track.enabled = !track.enabled; setMicEnabledPreview(track.enabled)
  }

  function handleConfirmJoin() {
    const finalName = nameDraft.trim() || name || 'Guest'
    setName(finalName)
    localStorage.setItem('cs_name', finalName)
    setJoined(true)
  }

  // Footer buttons wrap onto a second row on narrow screens instead of
  // requiring horizontal scrolling — see HostRoom.jsx's identical fix and
  // reasoning.

  const startShareRef = useRef(null)
  const renegotiateRef = useRef(null)
  // Floor mode (see docs/floor-mode-plan.md) — same forward-reference
  // problem as startShareRef/renegotiateRef above: handleDataMessage needs
  // to call these, but they only exist once useWebRTC() runs, which itself
  // needs handleDataMessage already defined to pass in as onMessage.
  const prepareFloorAudioRef = useRef(null)
  const clearFloorAudioRef = useRef(null)

  useEffect(() => {
    document.title = 'CollabStream \u00b7 Guest'
    return () => { document.title = 'CollabStream' }
  }, [])

  // Phase F: load host branding so guests see custom logo + accent
  useEffect(() => {
    if (!sessionId) return
    fetch(apiUrl(`/session/${sessionId}/branding`))
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        if (data.accentColor && data.accentColor !== '#22d3ee') {
          document.documentElement.style.setProperty('--color-accent', data.accentColor)
        }
        if (data.logoUrl) {
          // Store in Zustand for any component that reads branding.logoUrl
          useSession.getState().setBranding({ logoUrl: data.logoUrl, accentColor: data.accentColor || '#22d3ee' })
        }
      })
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    setSessionId(sessionId); setRole('guest')
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) setSessionToken(token)
    if (annotationColor === '#ef4444') setAnnotationColor('#facc15')
  }, [sessionId, setSessionId, setRole, annotationColor, setAnnotationColor])

  useEffect(() => {
    verifySession(sessionId)
      .then((res) => {
        if (!res.ok) { setNotFound(true); return }
        setLocked(!!res.locked)
        setJoinMode(res.joinMode || 'open')
        if (res.locked || res.joinMode === 'locked') setLocked(true)
        // Pre-launch lobby (docs/pre-launch-lobby-plan.md): sourced from the
        // same REST call already happening here, fastest available signal
        // — avoids requesting the camera before we know we're in a lobby.
        setSessionStarted(res.started !== false)
      })
      .catch(() => setNotFound(true))
  }, [sessionId])

  useEffect(() => {
    if (peerConnected) { setWaitingLong(false); return }
    const t = setTimeout(() => setWaitingLong(true), 30000)
    return () => clearTimeout(t)
  }, [peerConnected])

  const requestMedia = useCallback(() => {
    setMediaError(null)
    navigator.mediaDevices?.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
      .then((stream) => { setVideoEnabled(true); setLocalStream(stream) })
      .catch((err) => setMediaError(err?.name || 'Permission denied'))
  }, [setLocalStream])

  useEffect(() => {
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): don't request the
    // camera/mic while sitting in the lobby — see HostRoom.jsx's identical
    // reasoning. Fires immediately for null (not-yet-known) and true
    // (live), matching existing behavior for every non-scheduled session.
    if (sessionStarted === false) return
    requestMedia()
  }, [requestMedia, sessionStarted])

  // Camera/mic can stay on (OS-level indicator light included) even after
  // leaving, because React's unmount cleanup (below, and in
  // handleLeaveConfirm) isn't guaranteed to run to completion on a hard tab
  // close or reload. pagehide IS reliably fired by the browser before a tab
  // closes/navigates, so this calls stopLocalMedia directly as a redundant,
  // more trustworthy safety net. See HostRoom.jsx's identical fix.
  useEffect(() => {
    function onPageHide() { stopLocalMedia() }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [stopLocalMedia])

  useEffect(() => {
    if (name) return
    const id = `Guest-${Math.floor(Math.random() * 900 + 100)}`
    localStorage.setItem('cs_name', id)
    setName(id)
  }, [name])

  const sendData = useCallback((channel, msg) => {
    const ch = dataChannels?.[channel]
    if (ch?.readyState === 'open') ch.send(JSON.stringify(msg))
  }, [dataChannels])

  const { toggleMute, handleAudioEvent } = useAudio(sendData)
  const annotation = useAnnotation(canvasRef, pointerRef, sendData, 'guest')
  const control = useControl(videoRef, sendData)
  const { takeSnapshot } = useSnapshot(videoRef, canvasRef)
  const chat = useChat(sendData, 'guest', name || 'Guest')

  const addCaption = useCallback((caption) => {
    const id = caption.id || `${Date.now()}-${Math.random()}`
    setCaptions((items) => [...items.slice(-5), { id, ts: Date.now(), ...caption }])
    setTimeout(() => setCaptions((items) => items.filter((item) => item.id !== id)), 8000)
  }, [])

  const captionsHook = useCaptions(useCallback((text) => {
    const msg = { type: 'caption', text, from: name || 'Guest', fromPeerId: peerId, ts: Date.now() }
    addCaption({ ...msg, from: 'You' })
    sendData('annotation', msg)
  }, [addCaption, name, peerId, sendData]))

  const toggleCaptions = useCallback(() => {
    if (captionsHook.listening) {
      captionsHook.stop()
      setCaptionsEnabled(false)
      return
    }
    const started = captionsHook.start()
    if (started) setCaptionsEnabled(true)
  }, [captionsHook])

  const onCursorMove = useCallback((e) => {
    if (mode !== 'annotate') return
    const vid = videoRef.current; if (!vid) return
    const rect = vid.getBoundingClientRect()
    sendData('annotation', { type: 'cursor', x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
  }, [mode, sendData])

  function openChat() { setChatOpen(true); setUnreadCount(0) }
  function closeChat() { setChatOpen(false) }

  function handleLeaveConfirm() {
    sendData('annotation', { type: 'admin', action: 'leave', name })
    stopLocalMedia()
    navigate('/')
  }

  function sendWaitingChat() {
    const text = waitingChatInput.trim()
    if (!text) return
    signalingWrite?.({ type: 'waiting-chat', text })
    setWaitingMessages((m) => [...m, { from: 'me', text, t: Date.now() }])
    setWaitingChatInput('')
  }

  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). Sent straight over
  // the signaling WebSocket, not a WebRTC data channel — no PeerConnection
  // exists at all yet pre-start. Mirrors sendWaitingChat's pattern.
  function sendLobbyChat() {
    const text = lobbyChatInput.trim()
    if (!text) return
    signalingWrite?.({ type: 'lobby-chat', text })
    setLobbyMessages((m) => [...m, { from: 'me', text, t: Date.now() }])
    setLobbyChatInput('')
  }

  function handleWbClear() {
    annotation.clearCanvasLocal()
    sendData('annotation', { type: 'wb-clear' })
  }

  function commitText(value) {
    if (!value?.trim() || !textInput) { setTextInput(null); return }
    // Routed through addTextStamp so text participates in undo/clear/resize
    // redraw like every other stroke — see useAnnotation.js.
    annotation.addTextStamp(textInput.x, textInput.y, value, annotationColor, wbStrokeWidth)
    setTextInput(null)
  }

  useEffect(() => {
    if (!textInput) return
    requestAnimationFrame(() => {
      textInputRef.current?.focus()
      textInputRef.current?.select()
    })
  }, [textInput])

  function onWbPointerDown(e) {
    if (annotationTool === 'text' && mode === 'annotate') {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setTextInput({ x: px / rect.width, y: py / rect.height, px, py, value: '' })
      return
    }
    annotation.onPointerDown(e)
  }

  const handleDataMessage = useCallback((msg) => {
    if (msg.type === 'admin' && (msg.action === 'kick' || msg.action === 'end')) { stopLocalMedia(); navigate('/'); return }
    if (msg.type === 'draw' || msg.type === 'clear' || msg.type === 'stroke' || msg.type === 'laser' || msg.type === 'undo') annotation.handleRemoteDraw(msg)
    if (msg.type === 'wb-clear') annotation.clearCanvasLocal()
    if (msg.type === 'control') {
      if (msg.action === 'grant') { setControlToken(msg.token); setControlGranted(true); setMode('control'); annotation.clearCanvasLocal() }
      if (msg.action === 'revoke') { setControlToken(null); setControlGranted(false); setMode('view') }
      if (msg.action === 'deny') { setControlDenied(true); setTimeout(() => setControlDenied(false), 2000) }
    }
    if (msg.type === 'screen') {
      if (msg.action === 'approve') {
        setShareRequested(false); setSharingScreen(true)
        const start = startShareRef.current; const renegotiate = renegotiateRef.current
        if (!start || !renegotiate) return
        start(shareQuality).then((stream) => { if (stream) { setSharingScreen(true); renegotiate() } else setSharingScreen(false) })
      }
      if (msg.action === 'deny') { setShareRequested(false); setShareDenied(true); setTimeout(() => setShareDenied(false), 2000) }
      if (msg.action === 'started' && msg.streamId) setRemoteScreenStreamId(msg.streamId)
      if (msg.action === 'stopped') { setRemoteScreenStreamId(null); setRemoteScreenStream(null) }
    }
    if (msg.type === 'whiteboard') {
      // Clear on toggle, matching the host — the whiteboard and the
      // screen-share annotation overlay share the same canvas/stroke
      // history, so without this, old strokes from one surface would bleed
      // onto the other. See HostRoom.jsx's toggleWhiteboard for the same fix.
      annotation.clearCanvasLocal()
      if (msg.action === 'on') setWhiteboard(true)
      if (msg.action === 'off') setWhiteboard(false)
    }
    if (msg.type === 'floor-grant') {
      // Someone (possibly this guest) has been granted the floor — see
      // docs/floor-mode-plan.md. Arms webrtc's ontrack disambiguation so
      // the next audio-only track that arrives (the actual relayed audio,
      // via a separate WebRTC renegotiation the host triggers) is routed to
      // remoteFloorAudioStream instead of being dropped or confused for the
      // host's own stream. Does nothing audible by itself — the track
      // itself arrives shortly after over the WebRTC connection, not in
      // this message.
      //
      // Uses a ref (see prepareFloorAudioRef below) because this callback
      // is defined before useWebRTC() is called — same ordering constraint
      // as startShareRef/renegotiateRef further down in this file.
      setFloor(msg.peerId, msg.name)
      prepareFloorAudioRef.current?.(msg.peerId)
    }
    if (msg.type === 'floor-revoke') {
      setFloor(null, null)
      clearFloorAudioRef.current?.()
    }
    if (msg.type === 'reaction') {
      const id = Date.now() + Math.random()
      setReactions((r) => [...r, { id, emoji: msg.emoji, x: 30 + Math.random() * 40 }])
      setTimeout(() => setReactions((r) => r.filter((rx) => rx.id !== id)), 2100)
    }
    if (msg.type === 'roster' && Array.isArray(msg.guests)) {
      setRoster(msg.guests)
      if (typeof msg.count === 'number') setRosterCount(msg.count)
      // Derive this guest's own co-host status from the roster rather than
      // tracking it separately (see docs/co-host-plan.md) — the host is the
      // only source of truth, and the roster is already broadcast on every
      // change, so a separate promote/demote message type for the target
      // guest isn't needed.
      setIsCoHost(msg.guests.some((g) => g.id === peerId && g.cohost))
    }
    if (msg.type === 'chat' || msg.type === 'file-start' || msg.type === 'file-chunk' || msg.type === 'file-end') {
      chat.handle(msg)
      if (!chatOpen) { setUnreadCount((c) => c + 1); playChatMessage() }
    }
    if (msg.type === 'caption' && msg.text) {
      addCaption({
        ...msg,
        from: msg.fromPeerId === 'host' ? 'Host' : (msg.from || 'Guest'),
        id: `${msg.fromPeerId || 'peer'}-${msg.ts || Date.now()}-${Math.random()}`,
      })
    }
    handleAudioEvent(msg)
  }, [annotation, setControlGranted, setControlToken, setMode, handleAudioEvent, navigate, chat, chatOpen, setRemoteScreenStreamId, setRemoteScreenStream, shareQuality, stopLocalMedia, peerId, addCaption])

  const { handleSignal, setSignalSend, getStats, addScreenTrack, renegotiate, prepareFloorAudio, clearFloorAudio } = useWebRTC({
    role: 'guest', localStream, screenStream,
    onDataChannel: (channels) => setDataChannels({ ...channels }),
    onMessage: handleDataMessage,
    allowGuestOffers: true,
  })
  const network = useNetworkQuality(getStats, 'guest')
  const { startShare, stopShare } = useScreenShare(addScreenTrack)
  startShareRef.current = startShare
  renegotiateRef.current = renegotiate
  prepareFloorAudioRef.current = prepareFloorAudio
  clearFloorAudioRef.current = clearFloorAudio

  useEffect(() => () => {
    stopShare()
    stopLocalMedia()
  }, [stopShare, stopLocalMedia])

  async function toggleNoiseSupp() {
    const track = localStream?.getAudioTracks?.()?.[0]; if (!track) return
    const next = !noiseSupp
    try { await track.applyConstraints({ noiseSuppression: next }) } catch {}
    setNoiseSupp(next)
  }

  function sendReaction(emoji) {
    const id = Date.now() + Math.random()
    setReactions((r) => [...r, { id, emoji, x: 30 + Math.random() * 40 }])
    setTimeout(() => setReactions((r) => r.filter((rx) => rx.id !== id)), 2100)
    sendData('annotation', { type: 'reaction', emoji, from: 'guest' })
  }

  function toggleVideo() {
    const track = localStream?.getVideoTracks?.()[0]; if (!track) return
    track.enabled = !track.enabled; setVideoEnabled(track.enabled)
  }

  function toggleHand() {
    const next = !handRaised; setHandRaised(next)
    sendData('annotation', { type: 'hand', action: next ? 'raise' : 'lower' })
    // Distinct signal specifically for "let everyone hear me," separate
    // from the generic hand-raise — see docs/floor-mode-plan.md and the
    // matching handler in HostRoom.jsx's handleDataMessage.
    if (next) sendData('annotation', { type: 'floor-request' })
  }

  function requestShare() {
    if (sharingScreen) { stopShare(); setSharingScreen(false); return }
    setShareRequested(true)
    sendData('annotation', { type: 'screen', action: 'request' })
  }

  function toggleFocus() {
    setFocusMode((v) => { const next = !v; if (next) { setFocusHint(true); setTimeout(() => setFocusHint(false), 2000) }; return next })
  }

  // Co-host / assisted moderation (see docs/co-host-plan.md, Option A). This
  // guest's moderator UI never touches another guest's connection directly
  // — it can't, it doesn't hold one. It sends a request over the data
  // channel to the host, whose own browser tab re-dispatches it to the
  // exact same functions the host's own buttons call. See HostRoom.jsx's
  // handleDataMessage 'cohost-action' case.
  function sendCoHostAction(action, targetPeerId) {
    sendData('annotation', { type: 'cohost-action', action, targetPeerId })
  }

  useEffect(() => {
    if (!screenStream) return
    sendData('annotation', { type: 'screen', action: 'started', streamId: screenStream.id })
    return () => { sendData('annotation', { type: 'screen', action: 'stopped' }) }
  }, [screenStream, sendData])

  const { send: signalingWrite, retryCount, manualRetry, maxRetries } = useSignaling(sessionId, 'guest', (msg) => {
    if (msg.type === 'error' && ['room-full', 'invalid-token', 'room-locked', 'banned'].includes(msg.message)) setNotFound(true)
    if (msg.type === 'kicked') { stopLocalMedia(); setRemoved({ banned: !!msg.banned }); return }
    if (msg.type === 'admin') { handleDataMessage(msg); return }
    if (msg.type === 'peer-left') setPeerLeft(true)
    if (msg.type === 'pending-approval') { setPendingApproval(true); return }
    if (msg.type === 'admitted') {
      setPendingApproval(false); setAdmitted(true)
      // Pre-launch lobby (docs/pre-launch-lobby-plan.md) edge case: a lobby
      // guest who didn't fit under the cap when the host started the call
      // falls back to this normal admission flow, but their sessionStarted
      // was left at false from their earlier 'lobby-joined' response.
      // Without this, requestMedia's gate (`sessionStarted === false`)
      // would keep their camera from ever being requested, even once
      // manually admitted.
      setSessionStarted(true)
    }
    if (msg.type === 'knock-rejected') { setPendingApproval(false); setKnockRejected(true); return }
    if (msg.type === 'waiting-chat') { setWaitingMessages((m) => [...m, { from: 'host', text: msg.text, t: Date.now() }]); return }
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md).
    if (msg.type === 'lobby-joined') { setSessionStarted(false); return }
    if (msg.type === 'lobby-roster') { setLobbyGuests(msg.guests || []); return }
    if (msg.type === 'lobby-chat') {
      const name = msg.fromPeerId === 'host' ? 'Host' : (lobbyGuestsRef.current.find((g) => g.peerId === msg.fromPeerId)?.name || 'Guest')
      setLobbyMessages((m) => [...m, { from: name, text: msg.text, t: Date.now() }])
      return
    }
    if (msg.type === 'session-started') {
      // This guest already waited in the lobby and is being admitted
      // straight into the live call (settled decision in the plan doc: no
      // re-admission after already waiting) — setting admitted:true here
      // matters specifically to stop the joinMode==='approval' early-return
      // below from mistakenly showing the knock screen to a guest who was
      // already let in via the lobby, just because peerConnected hasn't
      // caught up to the WebRTC handshake yet.
      setSessionStarted(true)
      setAdmitted(true)
      return
    }
    handleSignal(msg)
  }, name || '')

  useEffect(() => { setSignalSend(signalingWrite) }, [signalingWrite, setSignalSend])
  useEffect(() => {
    // Pre-join lobby: WebRTC negotiation (and therefore being seen/heard by
    // the host) is deliberately deferred until the guest confirms via the
    // new lobby screen, not just whenever media happens to be ready.
    //
    // Also gated on sessionStarted !== false — this is a real fix, not
    // just new-feature plumbing: without it, a guest who confirms "Join
    // now" while still sitting in the pre-launch lobby (host hasn't
    // started yet) would send 'ready' immediately, which relay.js silently
    // no-ops for a 'guest-lobby'-role connection (see RELAY_TYPES handling
    // in relay.js). Since this effect's dependencies wouldn't change again
    // once the host actually starts the call, 'ready' would never get
    // resent and negotiation could stall. Adding sessionStarted here means
    // it correctly fires (or re-fires) exactly once the guest is both
    // joined AND actually admitted, whichever order those two happen in.
    // This gap existed in the original pre-launch-lobby feature too, just
    // newly surfaced by adding this join gate.
    if (signalingWrite && localStream && !pendingApproval && joined && sessionStarted !== false) signalingWrite({ type: 'ready' })
  }, [signalingWrite, localStream, pendingApproval, joined, sessionStarted])
  useEffect(() => { if (signalingWrite && screenStream) signalingWrite({ type: 'ready' }) }, [signalingWrite, screenStream])
  useEffect(() => { if (name && dataChannels) sendData('annotation', { type: 'admin', action: 'name', name }) }, [name, dataChannels])
  useEffect(() => { if (peerConnected) setPeerLeft(false) }, [peerConnected, setPeerLeft])

  // Sync the whiteboard canvas's pixel buffer to its display size and
  // repaint from stroke history after every resize. Without this, the
  // canvas used the browser's default 300×150 backing resolution stretched
  // via CSS to fill the screen — every whiteboard stroke would render
  // blurry/low-res, and text would be barely legible. Mirrors the
  // equivalent effect on the host side.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const sync = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const pointer = pointerRef.current
      if (pointer) { pointer.width = canvas.offsetWidth; pointer.height = canvas.offsetHeight }
      annotation.redraw?.()
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [whiteboard])

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      // See HostRoom.jsx's identical guard: without this, typing right
      // after selecting the Text tool (before the required canvas click)
      // silently fires a different shortcut instead, which looks exactly
      // like the text tool being broken.
      if (whiteboard && annotationTool === 'text') return
      if (e.key === 'Escape') { if (focusMode) { setFocusMode(false); return }; if (mode === 'control') { setMode('view'); setControlGranted(false); sendData('control', { type: 'control', action: 'revoke' }) }; return }
      if (e.key === 'f' || e.key === 'F') { toggleFocus(); return }
      if (e.key === '?') { setShortcutsOpen((v) => !v); return }
      if (e.key === 'd' || e.key === 'D') { setMode('annotate'); return }
      if (e.key === 'l' || e.key === 'L') { setMode('laser'); return }
      if (e.key === 'm' || e.key === 'M') { toggleMute(); return }
      if (e.key === 'c' || e.key === 'C') { chatOpen ? closeChat() : openChat(); return }
      if (e.key === 's' || e.key === 'S') { takeSnapshot(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setMode, setControlGranted, sendData, toggleMute, takeSnapshot, chatOpen, focusMode, whiteboard, annotationTool])

  // ── Special screens ───────────────────────────────────────────────────────
  if (notFound) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <p className="text-zinc-400 font-mono text-sm">Session not found or already full.</p>
      <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-mono hover:bg-zinc-800">Back to home</button>
    </div>
  )

  if (locked) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <p className="text-zinc-400 font-mono text-sm">Session is locked.</p>
      <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-mono hover:bg-zinc-800">Back to home</button>
    </div>
  )

  if (knockRejected) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <p className="text-zinc-400 font-mono text-sm">Host declined your request.</p>
      <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-mono hover:bg-zinc-800">Back to home</button>
    </div>
  )

  if (removed) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <p className="text-zinc-400 font-mono text-sm">
        {removed.banned ? 'You were removed from this session and cannot rejoin.' : 'You were removed from this session by the host.'}
      </p>
      <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-mono hover:bg-zinc-800">Back to home</button>
    </div>
  )

  // Moved ahead of the approval-knock/pending/lobby screens below
  // (previously this check sat at the very bottom of the file, after all
  // of them) — a guest whose camera/mic permission was denied in Approval
  // mode would otherwise get stuck on "Knock to join" forever with zero
  // indication of why, since that screen doesn't check media state at all
  // and this check was unreachable behind it.
  if (!localStream && mediaError) return <MediaPermissionScreen title="Camera and microphone needed" body="Enable access so the host can see and hear you." error={mediaError} onRetry={requestMedia} />

  // Pre-join lobby (redesign screen). Shown once the camera/mic preview is
  // ready, before anything else — approval knocking, the pre-launch lobby
  // chat, or the live call — so the guest always gets a chance to check
  // how they look/sound and set their name first. See the `joined` state
  // and the deferred 'ready' effect above for how this actually gates
  // WebRTC negotiation, not just what's visually shown.
  if (!joined && localStream) return (
    <div className="h-screen bg-ink-900 flex flex-col">
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-line">
        <button onClick={() => { stopLocalMedia(); navigate('/') }} className="text-ink-hi">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h3 className="font-display text-sm text-ink-hi">Room {sessionId?.slice(0, 8)}</h3>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl flex flex-col md:flex-row gap-7 items-center">
          <div className="relative flex-1 w-full aspect-video md:aspect-[16/10] rounded-2xl overflow-hidden bg-ink-800 border border-line">
            {videoEnabled ? (
              <VideoTile stream={localStream} name={nameDraft || 'You'} muted={true} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#9aa0ac" strokeWidth="1.4"><path d="M15 10l6-3v10l-6-3M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
              <button onClick={toggleMicPreview} title={micEnabledPreview ? 'Mute mic' : 'Unmute mic'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border border-line transition-colors ${micEnabledPreview ? 'bg-ink-800/80 text-ink-hi' : 'bg-coral text-white'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" /></svg>
              </button>
              <button onClick={toggleVideo} title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
                className={`w-9 h-9 rounded-full flex items-center justify-center border border-line transition-colors ${videoEnabled ? 'bg-ink-800/80 text-ink-hi' : 'bg-coral text-white'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
              </button>
            </div>
          </div>

          <div className="w-full md:w-64 flex-shrink-0">
            <h2 className="font-display text-lg text-ink-hi mb-1.5">Ready to join?</h2>
            <p className="text-ink-lo text-xs mb-5">
              Room {sessionId?.slice(0, 8)}
              {lobbyGuests.length > 0 ? ` \u00b7 ${lobbyGuests.length} ${lobbyGuests.length === 1 ? 'person' : 'people'} already here` : ''}
            </p>

            <div className="text-left mb-3.5">
              <label className="block text-[11px] text-ink-lo font-mono mb-1.5">Your name</label>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40}
                className="w-full bg-ink-700 border border-line rounded-lg px-3 py-2.5 text-ink-hi text-sm outline-none focus:border-amber/50" />
            </div>

            {cameraDevices.length > 0 && (
              <div className="text-left mb-3.5">
                <label className="block text-[11px] text-ink-lo font-mono mb-1.5">Camera</label>
                <select value={selectedCameraId} onChange={(e) => switchDevice('video', e.target.value)}
                  className="w-full bg-ink-700 border border-line rounded-lg px-3 py-2.5 text-ink-hi text-sm outline-none">
                  {cameraDevices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                </select>
              </div>
            )}

            {micDevices.length > 0 && (
              <div className="text-left mb-5">
                <label className="block text-[11px] text-ink-lo font-mono mb-1.5">Microphone</label>
                <select value={selectedMicId} onChange={(e) => switchDevice('audio', e.target.value)}
                  className="w-full bg-ink-700 border border-line rounded-lg px-3 py-2.5 text-ink-hi text-sm outline-none">
                  {micDevices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
                </select>
              </div>
            )}

            <button onClick={handleConfirmJoin}
              className="w-full px-4 py-3 rounded-xl bg-amber hover:brightness-110 text-ink-900 text-sm font-mono font-semibold transition-all">
              Join now
            </button>
            <button onClick={() => { stopLocalMedia(); navigate('/') }}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-transparent border border-line text-ink-lo text-sm font-mono hover:text-ink-hi transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  if (joinMode === 'approval' && !pendingApproval && !admitted && !peerConnected) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
      <div className="waiting-pulse w-16 h-16 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
      </div>
      <div className="text-center">
        <p className="text-slate-200 font-mono text-sm mb-1">This session requires approval to join.</p>
        <p className="text-slate-500 font-mono text-xs mb-6">Send a request and wait for the host to admit you.</p>
        {!hasKnocked ? (
          <button onClick={() => { signalingWrite?.({ type: 'knock', name: name || '' }); setHasKnocked(true); setPendingApproval(true) }}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl text-sm font-mono font-semibold transition-all">
            Knock to join
          </button>
        ) : (
          <p className="text-slate-400 font-mono text-xs">Waiting for host to admit you&hellip;</p>
        )}
      </div>
      <button onClick={() => navigate('/')} className="text-slate-600 text-xs font-mono hover:text-slate-400">Cancel</button>
    </div>
  )

  if (pendingApproval) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-5">
      <div className="waiting-pulse w-16 h-16 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
      </div>
      <p className="text-slate-200 font-mono text-sm">Waiting for host to admit you&hellip;</p>

      {/* Waiting-room chat (see docs/waiting-room-chat-plan.md) — a separate
          thread from in-call chat, since no WebRTC data channel exists yet
          for a guest who hasn't been admitted. */}
      <div className="w-[90%] max-w-sm bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
        <div className="max-h-40 overflow-y-auto space-y-1.5 mb-2">
          {waitingMessages.length === 0 ? (
            <p className="text-slate-600 text-xs font-mono">Send the host a message while you wait.</p>
          ) : waitingMessages.map((m) => (
            <div key={m.t + m.from} className={`text-xs font-mono ${m.from === 'me' ? 'text-cyan-300 text-right' : 'text-slate-300'}`}>
              <span className="text-slate-600">{m.from === 'me' ? 'You: ' : 'Host: '}</span>{m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={waitingChatInput}
            onChange={(e) => setWaitingChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendWaitingChat() }}
            placeholder="Message the host…"
            maxLength={500}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600"
          />
          <button onClick={sendWaitingChat} className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-900 text-xs font-mono font-semibold">Send</button>
        </div>
      </div>

      <button onClick={() => navigate('/')} className="text-slate-600 text-xs font-mono hover:text-slate-400">Cancel</button>
    </div>
  )

  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). A separate screen
  // from both the live call AND the approval-mode knock screen above —
  // this guest isn't knocking on anything, they arrived before the host
  // even started the session. Mirrors HostRoom.jsx's lobby view: presence
  // + shared text chat, no video (no PeerConnection exists yet).
  if (sessionStarted === false) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-5 px-6">
      <div className="waiting-pulse w-16 h-16 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      </div>
      <div className="text-center">
        <p className="text-slate-200 font-mono text-sm mb-1">You're early — the host hasn't started yet.</p>
        <p className="text-slate-500 font-mono text-xs">Hang out and chat below. This page connects automatically once they start.</p>
      </div>

      <div className="w-full max-w-sm">
        {lobbyGuests.length > 0 && (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="text-xs font-mono text-zinc-500 mb-1.5">Also waiting ({lobbyGuests.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {lobbyGuests.filter((g) => g.peerId !== peerId).map((g) => (
                <span key={g.peerId} className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono">{g.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
          <div className="max-h-40 overflow-y-auto space-y-1.5 mb-2">
            {lobbyMessages.length === 0 ? (
              <p className="text-slate-600 text-xs font-mono">No messages yet — say hi.</p>
            ) : lobbyMessages.map((m, i) => (
              <div key={i} className={`text-xs font-mono ${m.from === 'me' ? 'text-cyan-300 text-right' : 'text-slate-300'}`}>
                <span className="text-slate-600">{m.from === 'me' ? 'You: ' : `${m.from}: `}</span>{m.text}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={lobbyChatInput}
              onChange={(e) => setLobbyChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendLobbyChat() }}
              placeholder="Say hi…"
              maxLength={500}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600"
            />
            <button onClick={sendLobbyChat} className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-900 text-xs font-mono font-semibold">Send</button>
          </div>
        </div>
      </div>

      <button onClick={() => navigate('/')} className="text-slate-600 text-xs font-mono hover:text-slate-400">Cancel</button>
    </div>
  )

  const hasScreen = !!remoteScreenStream
  const chatIsDocked = chatOpen && chatDock === 'docked'
  const wbCurrentMode = mode === 'laser' ? 'laser' : (annotationTool === 'eraser' ? 'eraser' : annotationTool === 'text' ? 'text' : annotationTool === 'arrow' ? 'arrow' : 'annotate')

  return (
    <div className="h-screen app-bg flex flex-col overflow-hidden">
      {leaveConfirmOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 className="text-zinc-100 text-sm font-mono mb-1">Leave session?</h3>
            <p className="text-zinc-400 text-xs font-mono mb-4">The host will be notified when you leave.</p>
            <div className="flex gap-2">
              <button onClick={handleLeaveConfirm} className="flex-1 px-3 py-2 rounded-lg bg-red-700 text-white text-xs font-mono">Leave</button>
              <button onClick={() => setLeaveConfirmOpen(false)} className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Stay</button>
            </div>
          </div>
        </div>
      )}

      {!focusMode && (
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/70 glass z-20 safe-area overflow-x-auto scrollbar-none flex-nowrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.35)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            </div>
            <span className="font-mono text-xs text-slate-300 tracking-widest whitespace-nowrap">CollabStream</span>
            <span className="w-px h-4 bg-slate-800 flex-shrink-0" />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className="font-mono text-xs text-slate-400 whitespace-nowrap">{peerConnected ? 'Host connected' : 'Connecting\u2026'}</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <ModeBadge />
            <NetworkBadge quality={network} />
            <button onClick={() => setRosterOpen((v) => !v)} className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono whitespace-nowrap">
              Guests {rosterCount ? `(${rosterCount})` : roster.length ? `(${roster.length})` : ''}
            </button>
            {isCoHost && (
              <span title="You can kick/mute guests on the host's behalf" className="px-2 py-1 rounded-full bg-violet-950/60 border border-violet-800 text-violet-200 text-xs font-mono whitespace-nowrap flex items-center gap-1">
                ⭐ Co-host
              </span>
            )}
            {name && <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono whitespace-nowrap">{name}</span>}
            <button onClick={() => setLeaveConfirmOpen(true)} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-900 hover:text-red-300 text-slate-400 text-xs font-mono transition-all focus-ring whitespace-nowrap">Leave</button>
          </div>
        </header>
      )}

      <SignalingBanner signalingConnected={signalingConnected} retryCount={retryCount} manualRetry={manualRetry} maxRetries={maxRetries} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 relative p-3 overflow-hidden">
          {shareDenied && !focusMode && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-red-950/60 border border-red-800 text-red-200 text-xs font-mono z-30">Screen share denied</div>
          )}
          {peerLeft && !focusMode && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800 text-amber-200 text-xs font-mono z-30">Host left the session</div>
          )}
          {floorPeerId && !focusMode && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30">
              <Baton holderName={floorPeerId === peerId ? null : (floorPeerName || 'A guest')} isMe={floorPeerId === peerId} holding="floor" />
            </div>
          )}
          {rosterOpen && roster.length > 0 && !focusMode && (
            <div className="absolute left-3 top-14 slide-in-left bg-zinc-950/90 border border-zinc-800 rounded-xl p-3 text-xs font-mono z-30 max-w-[70vw]">
              <div className="text-zinc-400 mb-2">Guests ({roster.length})</div>
              <div className="space-y-1.5">
                {roster.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3">
                    <div className="text-zinc-300">
                      {g.name} {g.hand && <span className="text-amber-300">✋</span>} {g.cohost && <span className="ml-1 text-violet-300" title="Co-host">⭐</span>}
                    </div>
                    {/* This guest's own moderator controls, only shown if
                        THIS guest has been promoted (see docs/co-host-plan.md)
                        — and never for their own roster row, since a co-host
                        can't kick/mute themselves. */}
                    {isCoHost && g.id !== peerId && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => sendCoHostAction('mute', g.id)} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px]">Mute</button>
                        <button onClick={() => sendCoHostAction('kick', g.id)} className="px-1.5 py-0.5 rounded bg-red-950 border border-red-800 text-red-300 text-[10px]">Kick</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {whiteboard ? (
            <div className="w-full h-full bg-white relative rounded-xl overflow-hidden">
              {/* Guest whiteboard toolbar — simplified: Draw, Laser, Undo, Clear only */}
              <WhiteboardToolbar
                onSetMode={(m) => {
                  if (m === 'laser') { setMode('laser'); setAnnotationTool('laser') }
                  else if (m === 'text') { setMode('annotate'); setAnnotationTool('text') }
                  else if (m === 'arrow') { setMode('annotate'); setAnnotationTool('arrow') }
                  else { setMode('annotate'); setAnnotationTool('pen') }
                }}
                onClear={handleWbClear}
                onUndo={annotation.undo}
                onDownload={null}
                onExit={null}
                currentMode={wbCurrentMode}
                annotationColor={annotationColor}
                onColorChange={(c) => setAnnotationColor(c)}
                strokeWidth={wbStrokeWidth}
                onStrokeWidthChange={(w) => { setWbStrokeWidth(w); setAnnotationSize(w) }}
                isHost={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: 'none', cursor: annotationTool === 'text' ? 'text' : 'crosshair' }}
                onPointerDown={onWbPointerDown}
                onPointerMove={annotation.onPointerMove}
                onPointerUp={annotation.onPointerUp}
              />
              {textInput && (
                <input
                  ref={textInputRef}
                  value={textInput.value}
                  style={{
                    position: 'absolute',
                    left: textInput.px,
                    top: textInput.py,
                    background: 'rgba(2,6,15,0.75)',
                    border: 'none',
                    borderBottom: `2px solid ${annotationColor}`,
                    outline: 'none',
                    fontSize: `${16 * (wbStrokeWidth || 3) / 3}px`,
                    color: annotationColor,
                    fontFamily: 'monospace',
                    minWidth: 120,
                    zIndex: 30,
                    padding: '3px 5px',
                    borderRadius: 4,
                  }}
                  placeholder="Type text"
                  onChange={(e) => setTextInput((current) => current ? { ...current, value: e.target.value } : current)}
                  onBlur={(e) => commitText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitText(e.target.value); if (e.key === 'Escape') setTextInput(null) }}
                />
              )}
            </div>
          ) : hasScreen ? (
            <div className="w-full h-full" onMouseMove={onCursorMove}>
              <ScreenView stream={remoteScreenStream} canvasRef={canvasRef} pointerRef={pointerRef} videoRef={videoRef} muted={true} fit={fitMode}
                annotationHandlers={{
                  onPointerDown: mode === 'control' ? control.onMouseDown : annotation.onPointerDown,
                  onPointerMove: mode === 'control' ? control.onMouseMove : annotation.onPointerMove,
                  onPointerUp: mode === 'control' ? control.onMouseUp : annotation.onPointerUp,
                  onWheel: control.onWheel,
                  onResize: annotation.redraw,
                }} />
            </div>
          ) : !peerConnected ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-5">
              <div className="waiting-pulse w-16 h-16 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_32px_rgba(34,211,238,0.15)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
              </div>
              <div className="text-center">
                <p className="text-slate-200 font-mono text-sm mb-1">Waiting for host&hellip;</p>
                {waitingLong && <p className="text-slate-500 font-mono text-xs max-w-xs">Host may be setting up. This page will connect automatically.</p>}
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative"><VideoTile stream={remoteStream} name="Host" label="Host" muted={true} /></div>
          )}

          {hasScreen && localStream && !focusMode && (
            <div className="fixed right-4 bottom-24 z-50">
              <VideoFeed stream={localStream} name={name || 'You'} label="You" muted={true} corner="br" inline={true} />
            </div>
          )}

          <RemoteAudio stream={remoteStream} />
          <RemoteAudio stream={remoteFloorAudioStream} />
          <CaptionsOverlay captions={captions} interimText={captionsHook.interimText} enabled={captionsEnabled || captions.length > 0} />

          {reactions.map((r) => (
            <div key={r.id} className="reaction-float fixed pointer-events-none z-[9990] text-2xl" style={{ bottom: 80, left: `${r.x}%` }}>{r.emoji}</div>
          ))}

          {focusHint && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 border border-slate-700 text-slate-300 text-xs font-mono animate-fade-in">Press F to exit focus mode</div>
          )}
        </main>

        {chatIsDocked && !focusMode && (
          <ChatPanel messages={chat.messages} onSend={chat.send} onSendFile={chat.sendFile} onClose={closeChat}
            onOpen={() => setUnreadCount(0)} unreadCount={unreadCount} myRole="guest"
            initialDock="docked" onDockChange={setChatDock} />
        )}
      </div>

      {/* Footer — single scrollable row with arrows */}
      {!focusMode && (
        <footer className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-800/70 glass z-20 safe-area">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <AudioControls onToggleMute={toggleMute} />
              <button onClick={toggleNoiseSupp} className={`flex-shrink-0 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${noiseSupp ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-amber-950/30 border-amber-700 text-amber-200'}`}>
                {noiseSupp ? 'NS On' : 'NS Off'}
              </button>
              <button onClick={toggleVideo} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${videoEnabled ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-red-950/40 border-red-800 text-red-200'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                {videoEnabled ? 'Camera On' : 'Camera Off'}
              </button>
              <button onClick={toggleHand} className={`flex-shrink-0 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${handRaised ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                {handRaised ? '✋ Raised' : 'Raise Hand'}
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={requestShare} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${sharingScreen ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : shareRequested ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M12 10l3-3m0 0l3 3m-3-3v8" /></svg>
                  {sharingScreen ? 'Stop Share' : shareRequested ? 'Requesting\u2026' : 'Share Screen'}
                </button>
                <select value={shareQuality.label} onChange={(e) => setShareQuality(SHARE_QUALITIES.find((q) => q.label === e.target.value) || SHARE_QUALITIES[0])}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none font-mono flex-shrink-0">
                  {SHARE_QUALITIES.map((q) => <option key={q.label} value={q.label}>{q.label}</option>)}
                </select>
              </div>
              {flags.chat && (
                <div className="relative flex-shrink-0">
                  <button onClick={chatOpen ? closeChat : openChat} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${chatOpen ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    Chat
                  </button>
                  {unreadCount > 0 && !chatOpen && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-mono rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              )}
              {flags.captions && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={toggleCaptions}
                    disabled={!captionsHook.supported}
                    title={captionsHook.supported ? 'Captions use your browser speech service and may send mic audio to the browser provider.' : 'Captions work best in Chrome or Edge'}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${
                      captionsHook.listening
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100 disabled:text-slate-600 disabled:hover:text-slate-600'
                    }`}
                  >
                    {captionsHook.listening ? 'Captions On' : 'Captions'}
                  </button>
                  <span className="max-w-[180px] text-[10px] leading-tight text-slate-500">
                    {captionsHook.error || (captionsHook.supported ? 'Uses browser speech service.' : 'Chrome/Edge only.')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                {EMOJI_LIST.map((emoji) => (
                  <button key={emoji} onClick={() => sendReaction(emoji)} className="px-1.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-base hover:bg-slate-800 transition-colors">{emoji}</button>
                ))}
              </div>
              <button onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts" className="flex-shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
              </button>
              <button onClick={() => setHelpOpen(true)} title="How to use this call" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 whitespace-nowrap">
                Help
              </button>
          </div>
          <div className="w-px h-8 bg-slate-800 flex-shrink-0 hidden sm:block" />
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <AnnotationToolbar onClear={annotation.clearCanvas} onUndo={annotation.undo} onSetMode={setMode} />
            {flags.control && (
              <button onClick={() => sendData('control', { type: 'control', action: 'request' })} disabled={mode === 'control'}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 disabled:text-slate-600 focus-ring whitespace-nowrap">
                Request control
              </button>
            )}
            {flags.snapshot && (
              <button onClick={takeSnapshot} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 focus-ring whitespace-nowrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                Snapshot
              </button>
            )}
          </div>
        </footer>
      )}

      {chatOpen && !chatIsDocked && !focusMode && (
        <ChatPanel messages={chat.messages} onSend={chat.send} onSendFile={chat.sendFile} onClose={closeChat}
          onOpen={() => setUnreadCount(0)} unreadCount={unreadCount} myRole="guest"
          initialDock={chatDock} onDockChange={setChatDock} />
      )}

      {shortcutsOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShortcutsOpen(false)}>
          <div className="modal-enter bg-slate-950 border border-slate-800 rounded-2xl p-6 w-[90%] max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-100 text-sm font-mono">Keyboard Shortcuts</span>
              <button onClick={() => setShortcutsOpen(false)} className="text-slate-500 text-xs font-mono">Close</button>
            </div>
            <table className="w-full text-xs font-mono">
              <tbody>
                {[['?','Toggle this help'],['Esc','Exit control / exit focus'],['F','Focus mode'],['D','Draw mode'],['L','Laser mode'],['M','Mute mic'],['C','Toggle chat'],['S','Snapshot']].map(([k, d]) => (
                  <tr key={k} className="border-b border-slate-800/50"><td className="py-1.5 pr-4 text-cyan-300">{k}</td><td className="py-1.5 text-slate-400">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {controlDenied && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-2 rounded-full bg-red-950/80 border border-red-800 text-red-200 text-xs font-mono">Control request denied</div>
      )}

      <OnboardingTips role="guest" tips={['Draw or use Laser.', 'Request control.', 'Press ? for shortcuts, or Help for the full guide.']} />
      <HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} role="guest" />
      <CreatorSignature variant="console" projectName="CollabStream" />
    </div>
  )
}
