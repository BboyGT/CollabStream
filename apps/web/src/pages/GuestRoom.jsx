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
import ScreenView from '../components/ScreenView.jsx'
import VideoFeed from '../components/VideoFeed.jsx'
import VideoTile from '../components/VideoTile.jsx'
import ModeBadge from '../components/ModeBadge.jsx'
import AnnotationToolbar from '../components/AnnotationToolbar.jsx'
import AudioControls from '../components/AudioControls.jsx'
import RemoteAudio from '../components/RemoteAudio.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import WhiteboardToolbar from '../components/WhiteboardToolbar.jsx'
import { verifySession } from '../lib/session.js'
import MediaPermissionScreen from '../components/MediaPermissionScreen.jsx'
import useSnapshot from '../hooks/useSnapshot.js'
import useNetworkQuality from '../hooks/useNetworkQuality.js'
import NetworkBadge from '../components/NetworkBadge.jsx'
import OnboardingTips from '../components/OnboardingTips.jsx'
import CreatorSignature from '../components/CreatorSignature.jsx'
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
  const footerScrollRef = useRef(null)

  const [dataChannels, setDataChannels] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [locked, setLocked] = useState(false)
  const [mediaError, setMediaError] = useState(null)
  const [controlDenied, setControlDenied] = useState(false)
  const [name, setName] = useState(null)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [handRaised, setHandRaised] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [roster, setRoster] = useState([])
  const [rosterCount, setRosterCount] = useState(0)
  const [shareRequested, setShareRequested] = useState(false)
  const [shareDenied, setShareDenied] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const [shareQuality, setShareQuality] = useState(SHARE_QUALITIES[0])
  const [fitMode, setFitMode] = useState(() => window.matchMedia?.('(max-width: 768px)').matches ? 'cover' : 'contain')
  const [whiteboard, setWhiteboard] = useState(false)
  const [wbStrokeWidth, setWbStrokeWidth] = useState(3)
  const [reactions, setReactions] = useState([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [waitingLong, setWaitingLong] = useState(false)

  // Knock/approval
  const [joinMode, setJoinMode] = useState('open')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [knockRejected, setKnockRejected] = useState(false)
  const [hasKnocked, setHasKnocked] = useState(false)
  const [admitted, setAdmitted] = useState(false)

  // Leave confirmation
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDock, setChatDock] = useState(() => { try { return localStorage.getItem('cs_chat_dock') || 'floating' } catch { return 'floating' } })
  const [unreadCount, setUnreadCount] = useState(0)

  // Focus mode
  const [focusMode, setFocusMode] = useState(false)
  const [focusHint, setFocusHint] = useState(false)

  // Noise suppression
  const [noiseSupp, setNoiseSupp] = useState(true)

  // Footer scroll arrows
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = footerScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 8)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  useEffect(() => {
    const el = footerScrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => { el.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll) }
  }, [checkScroll])

  const startShareRef = useRef(null)
  const renegotiateRef = useRef(null)

  const {
    setSessionId, setRole, setLocalStream, setSessionToken, localStream,
    remoteStream, remoteScreenStream, mode, setMode,
    setControlGranted, setControlToken,
    peerConnected, signalingConnected, peerLeft, setPeerLeft,
    annotationColor, annotationTool,
    setAnnotationColor, setAnnotationSize, setAnnotationTool,
    screenStream, setRemoteScreenStreamId, setRemoteScreenStream,
    stopLocalMedia,
  } = useSession()

  useEffect(() => {
    document.title = 'CollabStream \u00b7 Guest'
    return () => { document.title = 'CollabStream' }
  }, [])

  // Phase F: load host branding so guests see custom logo + accent
  useEffect(() => {
    if (!sessionId) return
    fetch(`/session/${sessionId}/branding`)
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

  useEffect(() => { requestMedia() }, [requestMedia])

  useEffect(() => {
    const id = localStorage.getItem('cs_name') || `Guest-${Math.floor(Math.random() * 900 + 100)}`
    setName(id)
  }, [])

  const sendData = useCallback((channel, msg) => {
    const ch = dataChannels?.[channel]
    if (ch?.readyState === 'open') ch.send(JSON.stringify(msg))
  }, [dataChannels])

  const { toggleMute, handleAudioEvent } = useAudio(sendData)
  const annotation = useAnnotation(canvasRef, pointerRef, sendData, 'guest')
  const control = useControl(videoRef, sendData)
  const { takeSnapshot } = useSnapshot(videoRef, canvasRef)
  const chat = useChat(sendData, 'guest')

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

  function handleWbClear() {
    annotation.clearCanvasLocal()
    sendData('annotation', { type: 'wb-clear' })
  }

  const handleDataMessage = useCallback((msg) => {
    if (msg.type === 'admin' && (msg.action === 'kick' || msg.action === 'end')) { stopLocalMedia(); navigate('/'); return }
    if (msg.type === 'draw' || msg.type === 'clear' || msg.type === 'stroke' || msg.type === 'laser' || msg.type === 'undo') annotation.handleRemoteDraw(msg)
    if (msg.type === 'wb-clear') annotation.clearCanvasLocal()
    if (msg.type === 'text-stamp') {
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.font = `${16 * (msg.size || 3) / 3}px monospace`
      ctx.fillStyle = msg.color || '#000'
      ctx.fillText(msg.text, msg.x * canvas.width, msg.y * canvas.height)
    }
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
    if (msg.type === 'whiteboard') { if (msg.action === 'on') setWhiteboard(true); if (msg.action === 'off') setWhiteboard(false) }
    if (msg.type === 'reaction') {
      const id = Date.now() + Math.random()
      setReactions((r) => [...r, { id, emoji: msg.emoji, x: 30 + Math.random() * 40 }])
      setTimeout(() => setReactions((r) => r.filter((rx) => rx.id !== id)), 2100)
    }
    if (msg.type === 'roster' && Array.isArray(msg.guests)) { setRoster(msg.guests); if (typeof msg.count === 'number') setRosterCount(msg.count) }
    if (msg.type === 'chat' || msg.type === 'file-start' || msg.type === 'file-chunk' || msg.type === 'file-end') {
      chat.handle(msg)
      if (!chatOpen) { setUnreadCount((c) => c + 1); playChatMessage() }
    }
    handleAudioEvent(msg)
  }, [annotation, setControlGranted, setControlToken, setMode, handleAudioEvent, navigate, chat, chatOpen, setRemoteScreenStreamId, setRemoteScreenStream, shareQuality, stopLocalMedia])

  const { handleSignal, setSignalSend, getStats, addScreenTrack, renegotiate } = useWebRTC({
    role: 'guest', localStream, screenStream,
    onDataChannel: (channels) => setDataChannels({ ...channels }),
    onMessage: handleDataMessage,
    allowGuestOffers: true,
  })
  const network = useNetworkQuality(getStats, 'guest')
  const { startShare, stopShare } = useScreenShare(addScreenTrack)
  startShareRef.current = startShare
  renegotiateRef.current = renegotiate

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
  }

  function requestShare() {
    if (sharingScreen) { stopShare(); setSharingScreen(false); return }
    setShareRequested(true)
    sendData('annotation', { type: 'screen', action: 'request' })
  }

  function toggleFocus() {
    setFocusMode((v) => { const next = !v; if (next) { setFocusHint(true); setTimeout(() => setFocusHint(false), 2000) }; return next })
  }

  useEffect(() => {
    if (!screenStream) return
    sendData('annotation', { type: 'screen', action: 'started', streamId: screenStream.id })
    return () => { sendData('annotation', { type: 'screen', action: 'stopped' }) }
  }, [screenStream, sendData])

  const { send: signalingWrite, retryCount, manualRetry, maxRetries } = useSignaling(sessionId, 'guest', (msg) => {
    if (msg.type === 'error' && ['room-full', 'invalid-token', 'room-locked'].includes(msg.message)) setNotFound(true)
    if (msg.type === 'admin') { handleDataMessage(msg); return }
    if (msg.type === 'peer-left') setPeerLeft(true)
    if (msg.type === 'pending-approval') { setPendingApproval(true); return }
    if (msg.type === 'admitted') { setPendingApproval(false); setAdmitted(true) }
    if (msg.type === 'knock-rejected') { setPendingApproval(false); setKnockRejected(true); return }
    handleSignal(msg)
  })

  useEffect(() => { setSignalSend(signalingWrite) }, [signalingWrite, setSignalSend])
  useEffect(() => { if (signalingWrite && localStream && !pendingApproval) signalingWrite({ type: 'ready' }) }, [signalingWrite, localStream, pendingApproval])
  useEffect(() => { if (signalingWrite && screenStream) signalingWrite({ type: 'ready' }) }, [signalingWrite, screenStream])
  useEffect(() => { if (name && dataChannels) sendData('annotation', { type: 'admin', action: 'name', name }) }, [name, dataChannels])
  useEffect(() => { if (peerConnected) setPeerLeft(false) }, [peerConnected, setPeerLeft])

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
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
  }, [mode, setMode, setControlGranted, sendData, toggleMute, takeSnapshot, chatOpen, focusMode])

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
      <button onClick={() => navigate('/')} className="text-slate-600 text-xs font-mono hover:text-slate-400">Cancel</button>
    </div>
  )

  if (!localStream && mediaError) return <MediaPermissionScreen title="Camera and microphone needed" body="Enable access so the host can see and hear you." error={mediaError} onRetry={requestMedia} />

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
          {rosterOpen && roster.length > 0 && !focusMode && (
            <div className="absolute left-3 top-14 slide-in-left bg-zinc-950/90 border border-zinc-800 rounded-xl p-3 text-xs font-mono z-30 max-w-[70vw]">
              <div className="text-zinc-400 mb-2">Guests ({roster.length})</div>
              <div className="space-y-1">{roster.map((g) => <div key={g.id} className="text-zinc-300">{g.name} {g.hand && <span className="text-amber-300">✋</span>}</div>)}</div>
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
                style={{ touchAction: 'none' }}
                onPointerDown={annotation.onPointerDown}
                onPointerMove={annotation.onPointerMove}
                onPointerUp={annotation.onPointerUp}
              />
            </div>
          ) : hasScreen ? (
            <div className="w-full h-full" onMouseMove={onCursorMove}>
              <ScreenView stream={remoteScreenStream} canvasRef={canvasRef} pointerRef={pointerRef} videoRef={videoRef} muted={true} fit={fitMode}
                annotationHandlers={{
                  onPointerDown: mode === 'control' ? control.onMouseDown : annotation.onPointerDown,
                  onPointerMove: mode === 'control' ? control.onMouseMove : annotation.onPointerMove,
                  onPointerUp: mode === 'control' ? control.onMouseUp : annotation.onPointerUp,
                  onWheel: control.onWheel,
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
        <footer className="flex items-center px-0 py-0 border-t border-slate-800/70 glass z-20 safe-area">
          <div className="relative flex items-center flex-1 min-w-0">
            {canScrollLeft && (
              <button
                onClick={() => footerScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
                className="absolute left-0 z-10 h-full px-2 bg-gradient-to-r from-zinc-950 to-transparent text-slate-400 hover:text-slate-200 flex items-center text-lg leading-none"
              >
                &#8249;
              </button>
            )}
            <div ref={footerScrollRef} className="flex items-center gap-2 overflow-x-auto scrollbar-none px-4 py-3 min-w-0">
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
              <div className="flex items-center gap-1 flex-shrink-0">
                {EMOJI_LIST.map((emoji) => (
                  <button key={emoji} onClick={() => sendReaction(emoji)} className="px-1.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-base hover:bg-slate-800 transition-colors">{emoji}</button>
                ))}
              </div>
              <button onClick={() => setShortcutsOpen(true)} className="flex-shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
              </button>
            </div>
            {canScrollRight && (
              <button
                onClick={() => footerScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
                className="absolute right-0 z-10 h-full px-2 bg-gradient-to-l from-zinc-950 to-transparent text-slate-400 hover:text-slate-200 flex items-center text-lg leading-none"
              >
                &#8250;
              </button>
            )}
          </div>
          <div className="w-px h-8 bg-slate-800 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-shrink-0 px-4 py-3">
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

      <OnboardingTips role="guest" tips={['Draw or use Laser.', 'Request control.', 'Press ? for shortcuts.']} />
      <CreatorSignature variant="console" projectName="CollabStream" />
    </div>
  )
}
