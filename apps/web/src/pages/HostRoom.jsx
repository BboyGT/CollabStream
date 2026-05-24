import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSession from '../store/session.js'
import useSignaling from '../hooks/useSignaling.js'
import useWebRTCHost from '../hooks/useWebRTCHost.js'
import CreatorSignature from '../components/CreatorSignature.jsx'
import useAudio from '../hooks/useAudio.js'
import useScreenShare, { SHARE_QUALITIES } from '../hooks/useScreenShare.js'
import useAnnotation from '../hooks/useAnnotation.js'
import useCompanion from '../hooks/useCompanion.js'
import useChat from '../hooks/useChat.js'
import ScreenView from '../components/ScreenView.jsx'
import VideoFeed from '../components/VideoFeed.jsx'
import VideoTile from '../components/VideoTile.jsx'
import ControlBar from '../components/ControlBar.jsx'
import CompanionStatus from '../components/CompanionStatus.jsx'
import AudioControls from '../components/AudioControls.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import WhiteboardToolbar from '../components/WhiteboardToolbar.jsx'
import { getPublicOrigin, guestJoinUrl, resolveJoinCode } from '../lib/session.js'
import RemoteAudio from '../components/RemoteAudio.jsx'
import MediaPermissionScreen from '../components/MediaPermissionScreen.jsx'
import useSnapshot from '../hooks/useSnapshot.js'
import useNetworkQuality from '../hooks/useNetworkQuality.js'
import NetworkBadge from '../components/NetworkBadge.jsx'
import OnboardingTips from '../components/OnboardingTips.jsx'
import { flags } from '../lib/flags.js'
import InviteModal from '../components/InviteModal.jsx'
import ScheduleModal from '../components/ScheduleModal.jsx'
import { playGuestJoin, playGuestLeave, playChatMessage, playControlGranted } from '../lib/sounds.js'

const GUEST_CURSOR_COLORS = ['#22d3ee', '#f59e0b', '#34d399', '#f472b6']
const GUESTS_PER_PAGE = 6

function formatTime(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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

// Fix 1 + Fix 2: onMouseDown trigger, 'click' outside listener, z-[9999],
// setTimeout so modal state updates fire OUTSIDE the event batch
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onMouseDown={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono hover:bg-slate-800 focus-ring"
      >
        &middot;&middot;&middot;
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-enter absolute right-0 top-9 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-[9999] min-w-[210px] py-1 overflow-hidden"
        >
          {items.map((item, i) =>
            item === 'divider'
              ? <div key={i} className="my-1 border-t border-slate-800" />
              : (
                <button
                  key={i}
                  // Fix 1: setTimeout breaks React event batch so modal state
                  // updates (setInviteOpen, setScheduleOpen, etc.) render correctly
                  onClick={() => { setOpen(false); setTimeout(() => item.onClick(), 0) }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs font-mono text-slate-300 hover:bg-slate-900 hover:text-slate-100 transition-colors text-left"
                >
                  {item.icon && <span className="text-slate-500">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                  {item.hint && <span className="text-slate-600">{item.hint}</span>}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}

export default function HostRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const pointerRef = useRef(null)
  const videoRef = useRef(null)
  const cursorCanvasRef = useRef(null)
  const footerScrollRef = useRef(null)

  const [sharing, setSharing] = useState(false)
  const [shareQuality, setShareQuality] = useState(SHARE_QUALITIES[0])
  const [whiteboard, setWhiteboard] = useState(false)
  const [wbStrokeWidth, setWbStrokeWidth] = useState(3)
  const [textInput, setTextInput] = useState(null)
  const [controlSupported, setControlSupported] = useState(true)
  const [mediaError, setMediaError] = useState(null)
  const [pendingControlPeerId, setPendingControlPeerId] = useState(null)
  const [controlPeerId, setControlPeerId] = useState(null)
  const [pendingSharePeerId, setPendingSharePeerId] = useState(null)
  const [guestStreams, setGuestStreams] = useState({})
  const [guestScreenStreams, setGuestScreenStreams] = useState({})
  const [focusGuestId, setFocusGuestId] = useState(null)
  const [fitMode, setFitMode] = useState('contain')
  const [guestOrder, setGuestOrder] = useState([])
  const [guestAudioMuted, setGuestAudioMuted] = useState({})
  const [guestNames, setGuestNames] = useState({})
  const [guestCursors, setGuestCursors] = useState({})
  const [locked, setLocked] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [joinCode, setJoinCode] = useState(null)
  const [shortCode, setShortCode] = useState(null)
  const [publicOrigin, setPublicOrigin] = useState(window.location.origin)
  const [lanOrigin, setLanOrigin] = useState(null)
  const [joinValid, setJoinValid] = useState(null)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [raisedHands, setRaisedHands] = useState({})
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [sessionName] = useState(() => localStorage.getItem('cs_session_name') || '')
  const [handQueue, setHandQueue] = useState([])
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef(null)
  const recordChunksRef = useRef([])
  const audioCtxRef = useRef(null)
  const [sessionDuration, setSessionDuration] = useState(120)
  const [maxGuests, setMaxGuests] = useState(null)
  const [capMenuOpen, setCapMenuOpen] = useState(false)
  const [knockQueue, setKnockQueue] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDock, setChatDock] = useState(() => { try { return localStorage.getItem('cs_chat_dock') || 'floating' } catch { return 'floating' } })
  const [chatTarget, setChatTarget] = useState('all')
  const [unreadCount, setUnreadCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const sessionStartRef = useRef(null)
  const prevGuestCountRef = useRef(0)
  const peakGuestCountRef = useRef(0)  // Fix 7
  const [guestListOpen, setGuestListOpen] = useState(false)
  const [reactions, setReactions] = useState([])
  const [controlFlash, setControlFlash] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [screenExpanding, setScreenExpanding] = useState(false)
  const prevSharingRef = useRef(false)
  const [focusMode, setFocusMode] = useState(false)
  const [focusHint, setFocusHint] = useState(false)
  const [noiseSupp, setNoiseSupp] = useState(true)
  const [isPiP, setIsPiP] = useState(false)  // Fix 4
  const [showRecap, setShowRecap] = useState(false)  // Fix 7
  const [recapData, setRecapData] = useState(null)  // Fix 7
  const [showReloadHint, setShowReloadHint] = useState(true)  // Fix 5
  const [guestPage, setGuestPage] = useState(0)  // Fix 8

  // Footer scroll arrows
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = footerScrollRef.current; if (!el) return
    setCanScrollLeft(el.scrollLeft > 8)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  useEffect(() => {
    const el = footerScrollRef.current; if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => { el.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll) }
  }, [checkScroll])

  const [joinToasts, setJoinToasts] = useState([])
  const addJoinToast = useCallback((msg) => {
    const id = Date.now() + Math.random()
    setJoinToasts((t) => [...t, { id, msg }])
    setTimeout(() => setJoinToasts((t) => t.filter((x) => x.id !== id)), 2500)
  }, [])

  const {
    setSessionId, setRole, setLocalStream, setSessionToken, localStream,
    screenStream, controlToken,
    annotationColor, annotationTool,
    setAnnotationColor, setAnnotationSize, setAnnotationTool,
    setControlGranted, setControlToken, setMode, setPeerConnected,
    peerConnected, signalingConnected, peerLeft, setPeerLeft, guestCount,
    mode, branding, userPlan,
    stopLocalMedia,
  } = useSession()

  // Fix 5: beforeunload reload guard
  useEffect(() => {
    function guard(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  // Fix 5: reload hint fades after 10s
  useEffect(() => {
    const t = setTimeout(() => setShowReloadHint(false), 10000)
    return () => clearTimeout(t)
  }, [])

  // Fix 7: track peak guest count
  useEffect(() => {
    if (guestOrder.length > peakGuestCountRef.current) {
      peakGuestCountRef.current = guestOrder.length
    }
  }, [guestOrder.length])

  // Fix 8: reset page when count changes
  useEffect(() => { setGuestPage(0) }, [guestOrder.length])

  useEffect(() => {
    document.title = sessionName ? `${sessionName} \u00b7 CollabStream` : 'CollabStream Host'
    return () => { document.title = 'CollabStream' }
  }, [sessionName])

  useEffect(() => {
    setSessionId(sessionId); setRole('host')
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (token) setSessionToken(token)
  }, [sessionId, setSessionId, setRole])

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

  // Fix 3: stop tracks on unmount
  useEffect(() => {
    return () => { stopLocalMedia() }
  }, [stopLocalMedia])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    fetch(`/session/${sessionId}?token=${encodeURIComponent(token)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setLocked(!!d.locked); setJoinCode(d.joinCode || null); setShortCode(d.shortCode || null)
        setSessionDuration(d.durationMinutes || 120); setMaxGuests(d.maxGuests || null)
      })
      .catch(() => navigate('/'))
    setInviteOpen(true)
  }, [sessionId])

  useEffect(() => {
    getPublicOrigin().then((origin) => {
      const safeOrigin = typeof origin === 'string' && origin ? origin.replace(/\/$/, '') : window.location.origin
      setPublicOrigin(safeOrigin)
      if (safeOrigin.includes('ngrok') || safeOrigin.includes('ngrok-free')) {
        fetch('/public-host').then((r) => r.json()).then((d) => { if (d?.origin) setLanOrigin(d.origin.replace(/\/$/, '')) }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (shortCode) navigator.clipboard.writeText(shortCode).catch(() => {})
    else if (joinCode) navigator.clipboard.writeText(joinCode).catch(() => {})
  }, [joinCode, shortCode])

  useEffect(() => {
    if (!joinCode) return
    resolveJoinCode(joinCode).then((r) => setJoinValid(!!r)).catch(() => setJoinValid(false))
  }, [joinCode])

  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setControlSupported(!hasTouch && !window.matchMedia('(max-width: 768px)').matches)
  }, [])

  useEffect(() => { if (peerConnected) setPeerLeft(false) }, [peerConnected, setPeerLeft])
  useEffect(() => { if (guestOrder.length > 0) setInviteOpen(false) }, [guestOrder.length])

  useEffect(() => {
    if (guestOrder.length > 0 && !sessionStartRef.current) {
      sessionStartRef.current = Date.now()
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)), 1000)
    }
  }, [guestOrder.length])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => {
    const cur = guestOrder.length; const prev = prevGuestCountRef.current
    if (cur > prev) playGuestJoin(); else if (cur < prev) playGuestLeave()
    prevGuestCountRef.current = cur
  }, [guestOrder.length])

  useEffect(() => {
    if (!prevSharingRef.current && (sharing || !!screenStream)) { setScreenExpanding(true); setTimeout(() => setScreenExpanding(false), 300) }
    prevSharingRef.current = sharing || !!screenStream
  }, [sharing, screenStream])

  // Fix 2: sync canvas pixel dimensions to display size, re-sync when whiteboard opens
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const sync = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const pointer = pointerRef.current
      if (pointer) { pointer.width = canvas.offsetWidth; pointer.height = canvas.offsetHeight }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [whiteboard])

  const companion = useCompanion()
  const screenAnnouncedRef = useRef(null)

  const hostRTC = useWebRTCHost({
    localStream, screenStream,
    onDataChannel: (peerId, channels) => {
      if (channels.annotation) channels.annotation.onmessage = (e) => { try { handleDataMessage(JSON.parse(e.data), peerId) } catch {} }
      if (channels.control) channels.control.onmessage = (e) => { try { handleDataMessage(JSON.parse(e.data), peerId) } catch {} }
    },
    onPeerStream: (peerId, stream, track) => {
      const label = (track?.label || '').toLowerCase()
      const settings = typeof track?.getSettings === 'function' ? track.getSettings() : null
      const isScreen = settings?.displaySurface || label.includes('screen') || label.includes('window') || label.includes('display') || label.includes('monitor')
      if (track?.kind === 'video' && isScreen) { setGuestScreenStreams((s) => ({ ...s, [peerId]: stream })); setFocusGuestId((c) => c || peerId) }
      else setGuestStreams((s) => ({ ...s, [peerId]: stream }))
      setGuestOrder((o) => (o.includes(peerId) ? o : [...o, peerId]))
    },
    onPeerState: (peerId, state) => {
      if (state === 'disconnected' || state === 'closed') {
        addJoinToast(`${guestNames[peerId] || 'A guest'} disconnected`)
        setGuestStreams((s) => { const n = { ...s }; delete n[peerId]; return n })
        setGuestOrder((o) => o.filter((id) => id !== peerId))
        setRaisedHands((h) => { const n = { ...h }; delete n[peerId]; return n })
        setGuestAudioMuted((m) => { const n = { ...m }; delete n[peerId]; return n })
        setGuestNames((n) => { const nx = { ...n }; delete nx[peerId]; return nx })
        setGuestCursors((c) => { const n = { ...c }; delete n[peerId]; return n })
      }
    },
  })

  const sendAll = useCallback((channel, msg, exceptPeerId) => hostRTC.broadcast(channel, msg, exceptPeerId), [hostRTC])
  const { toggleMute, handleAudioEvent } = useAudio(sendAll)
  const annotation = useAnnotation(canvasRef, pointerRef, sendAll, 'host')
  const { takeSnapshot } = useSnapshot(videoRef, canvasRef)
  const chat = useChat(sendAll, 'host')

  const broadcastRoster = useCallback(() => {
    const roster = guestOrder.map((gid, idx) => ({ id: gid, name: guestNames[gid] || `Guest ${idx + 1}`, hand: !!raisedHands[gid] }))
    hostRTC.broadcast('annotation', { type: 'roster', guests: roster, count: guestOrder.length, queue: handQueue })
  }, [guestOrder, guestNames, raisedHands, handQueue, hostRTC])

  useEffect(() => { if (guestOrder.length > 0) broadcastRoster() }, [guestOrder, guestNames, raisedHands, broadcastRoster])

  useEffect(() => {
    const canvas = cursorCanvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    Object.entries(guestCursors).forEach(([peerId, pos], i) => {
      const color = GUEST_CURSOR_COLORS[i % GUEST_CURSOR_COLORS.length]
      const x = pos.x * canvas.width; const y = pos.y * canvas.height
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
      ctx.font = '11px monospace'; ctx.fillStyle = color
      ctx.fillText(guestNames[peerId] || 'Guest', x + 10, y - 4)
    })
  }, [guestCursors, guestNames])

  function commitText(value) {
    if (!value?.trim() || !textInput) { setTextInput(null); return }
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.font = `${16 * (wbStrokeWidth || 3) / 3}px monospace`
    ctx.fillStyle = annotationColor
    ctx.fillText(value, textInput.x * canvas.width, textInput.y * canvas.height)
    hostRTC.broadcast('annotation', { type: 'text-stamp', x: textInput.x, y: textInput.y, text: value, color: annotationColor, size: wbStrokeWidth })
    setTextInput(null)
  }

  const handleDataMessage = useCallback((msg, peerId) => {
    if (msg.type === 'draw' || msg.type === 'clear' || msg.type === 'stroke' || msg.type === 'laser' || msg.type === 'undo') {
      annotation.handleRemoteDraw(msg); hostRTC.broadcast('annotation', msg, peerId)
    }
    if (msg.type === 'wb-clear') { annotation.clearCanvasLocal(); hostRTC.broadcast('annotation', msg, peerId) }
    if (msg.type === 'text-stamp') {
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.font = `${16 * (msg.size || 3) / 3}px monospace`
      ctx.fillStyle = msg.color || '#000'
      ctx.fillText(msg.text, msg.x * canvas.width, msg.y * canvas.height)
      hostRTC.broadcast('annotation', msg, peerId)
    }
    if (msg.type === 'input' && controlToken && peerId === controlPeerId) companion.forwardInput(controlToken, msg)
    if (msg.type === 'admin' && msg.action === 'name' && msg.name) { setGuestNames((n) => ({ ...n, [peerId]: msg.name })); addJoinToast(`${msg.name} joined`) }
    if (msg.type === 'admin' && msg.action === 'leave') addJoinToast(`${guestNames[peerId] || 'Guest'} left the session`)
    if (msg.type === 'hand') {
      if (msg.action === 'raise') { setRaisedHands((h) => ({ ...h, [peerId]: true })); setHandQueue((q) => q.includes(peerId) ? q : [...q, peerId]) }
      if (msg.action === 'lower') { setRaisedHands((h) => { const n = { ...h }; delete n[peerId]; return n }); setHandQueue((q) => q.filter((id) => id !== peerId)) }
    }
    if (msg.type === 'control' && msg.action === 'request') {
      if (!controlSupported) hostRTC.sendToPeer(peerId, 'control', { type: 'control', action: 'deny' })
      else setPendingControlPeerId(peerId)
    }
    if (msg.type === 'screen' && msg.action === 'request') setPendingSharePeerId(peerId)
    if (msg.type === 'screen' && msg.action === 'started') { setGuestScreenStreams((s) => ({ ...s, [peerId]: s[peerId] || null })); setFocusGuestId((c) => c || peerId) }
    if (msg.type === 'cursor') setGuestCursors((c) => ({ ...c, [peerId]: { x: msg.x, y: msg.y } }))
    if (msg.type === 'reaction') {
      const id = Date.now() + Math.random()
      setReactions((r) => [...r, { id, emoji: msg.emoji, x: 30 + Math.random() * 40 }])
      setTimeout(() => setReactions((r) => r.filter((rx) => rx.id !== id)), 2100)
      hostRTC.broadcast('annotation', msg, peerId)
    }
    if (msg.type === 'whiteboard') { if (msg.action === 'on') setWhiteboard(true); if (msg.action === 'off') setWhiteboard(false) }
    if (msg.type === 'chat' || msg.type === 'file-start' || msg.type === 'file-chunk' || msg.type === 'file-end') {
      chat.handle(msg)
      if (!chatOpen) { setUnreadCount((c) => c + 1); playChatMessage() }
    }
    handleAudioEvent(msg)
  }, [annotation, companion, controlToken, handleAudioEvent, controlPeerId, controlSupported, hostRTC, chat, chatOpen, addJoinToast, guestNames])

  const { send: signalingWrite, retryCount, manualRetry, maxRetries } = useSignaling(sessionId, 'host', (msg) => {
    if (msg.type === 'admin' && msg.action === 'end') {
      stopShare()
      stopLocalMedia()
      navigate('/')
      return
    }
    if (msg.type === 'peer-left') setPeerLeft(true)
    if (msg.type === 'knock') setKnockQueue((q) => [...q, { peerId: msg.peerId, name: msg.name || 'Guest' }])
    hostRTC.handleSignal(msg)
  })

  useEffect(() => { hostRTC.setSignalSend(signalingWrite) }, [signalingWrite, hostRTC])

  const { startShare, stopShare } = useScreenShare(hostRTC.addScreenTrack)

  async function handleShare() {
    if (sharing) { stopShare(); setSharing(false); return }
    const stream = await startShare(shareQuality)
    if (stream) setSharing(true)
  }

  useEffect(() => {
    if (screenStream?.id && screenAnnouncedRef.current !== screenStream.id) {
      screenAnnouncedRef.current = screenStream.id
      hostRTC.broadcast('annotation', { type: 'screen', action: 'started', streamId: screenStream.id })
    }
    if (!screenStream && screenAnnouncedRef.current) {
      screenAnnouncedRef.current = null
      hostRTC.broadcast('annotation', { type: 'screen', action: 'stopped' })
    }
  }, [screenStream])

  function toggleVideo() {
    const track = localStream?.getVideoTracks?.()[0]; if (!track) return
    track.enabled = !track.enabled; setVideoEnabled(track.enabled)
  }

  async function toggleNoiseSupp() {
    const track = localStream?.getAudioTracks?.()?.[0]; if (!track) return
    const next = !noiseSupp
    try { await track.applyConstraints({ noiseSuppression: next }) } catch {}
    setNoiseSupp(next)
  }

  function handleMuteAll() {
    const next = {}
    Object.keys(guestStreams).forEach((id) => { next[id] = true; hostRTC.setRemoteAudio(id, false) })
    setGuestAudioMuted(next)
  }

  // Fix 6: unmute all
  function handleUnmuteAll() {
    guestOrder.forEach((id) => hostRTC.setRemoteAudio(id, true))
    setGuestAudioMuted({})
  }

  function handleAllowSpeak(peerId) {
    hostRTC.setRemoteAudio(peerId, true)
    setGuestAudioMuted((m) => ({ ...m, [peerId]: false }))
    setRaisedHands((h) => { const n = { ...h }; delete n[peerId]; return n })
  }

  function handleGrant() {
    const token = crypto.randomUUID()
    setControlToken(token); setControlGranted(true); setMode('view')
    companion.arm(token)
    annotation.clearCanvasLocal()
    hostRTC.broadcast('annotation', { type: 'clear' })
    if (pendingControlPeerId) {
      hostRTC.sendToPeer(pendingControlPeerId, 'control', { type: 'control', action: 'grant', token })
      setControlPeerId(pendingControlPeerId); setPendingControlPeerId(null)
    }
    setControlFlash(true); setTimeout(() => setControlFlash(false), 1500)
    playControlGranted()
  }

  function handleRevoke() {
    setControlGranted(false); setControlToken(null); setMode('view')
    companion.disarm()
    if (controlPeerId) hostRTC.sendToPeer(controlPeerId, 'control', { type: 'control', action: 'revoke' })
    setControlPeerId(null)
  }

  // Fix 4: exit PiP before entering whiteboard
  async function toggleWhiteboard() {
    if (document.pictureInPictureElement) {
      try { await document.exitPictureInPicture() } catch {}
      setIsPiP(false)
    }
    const next = !whiteboard
    setWhiteboard(next)
    hostRTC.broadcast('annotation', { type: 'whiteboard', action: next ? 'on' : 'off' })
  }

  function handleWbClear() {
    annotation.clearCanvas()
    hostRTC.broadcast('annotation', { type: 'wb-clear' })
  }

  function handleWbDownload() {
    const canvas = canvasRef.current; if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a'); a.href = url
    a.download = `collabstream-whiteboard-${Date.now()}.png`; a.click()
  }

  function onWbPointerDown(e) {
    if (annotationTool === 'text' && mode === 'annotate') {
      const canvas = canvasRef.current; if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left; const py = e.clientY - rect.top
      setTextInput({ x: px / rect.width, y: py / rect.height, px, py })
      return
    }
    annotation.onPointerDown(e)
  }

  function toggleFocus() {
    setFocusMode((v) => { const next = !v; if (next) { setFocusHint(true); setTimeout(() => setFocusHint(false), 2000) }; return next })
  }

  function openChat() { setChatOpen(true); setUnreadCount(0) }
  function closeChat() { setChatOpen(false) }

  function admitKnock() {
    const knock = knockQueue[0]; if (!knock) return
    signalingWrite({ type: 'knock-response', action: 'approve', peerId: knock.peerId })
    setKnockQueue((q) => q.slice(1))
  }
  function rejectKnock() {
    const knock = knockQueue[0]; if (!knock) return
    signalingWrite({ type: 'knock-response', action: 'reject', peerId: knock.peerId })
    setKnockQueue((q) => q.slice(1))
  }

  async function updateCap(newCap) {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(`/session/${sessionId}/cap?token=${encodeURIComponent(token)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxGuests: newCap }),
    })
    if (res.ok) { setMaxGuests(newCap); setCapMenuOpen(false) }
  }

  async function downloadAudit() {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(`/session/${sessionId}/audit?token=${encodeURIComponent(token)}`)
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data.events || [], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `collabstream-audit-${sessionId}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  function buildMixedAudioStream(guestIds) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const dest = ctx.createMediaStreamDestination()
    audioCtxRef.current = ctx
    try {
      if (localStream?.getAudioTracks?.().length) ctx.createMediaStreamSource(localStream).connect(dest)
      guestIds.forEach((gid) => { const gs = guestStreams[gid]; if (gs?.getAudioTracks?.().length) ctx.createMediaStreamSource(gs).connect(dest) })
    } catch {}
    return dest.stream
  }

  function handleRecord() {
    if (userPlan === 'free') {
      addJoinToast('Recording is a Pro feature')
      return
    }
    if (recording) { recorderRef.current?.stop(); setRecording(false); return }
    const videoSource = screenStream || localStream; if (!videoSource) return
    const mixedAudio = buildMixedAudioStream(Object.keys(guestStreams))
    const tracks = [...videoSource.getVideoTracks(), ...(mixedAudio?.getAudioTracks?.() || [])]
    const stream = new MediaStream(tracks)
    recordChunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
    recorderRef.current = recorder
    recorder.ondataavailable = (e) => { if (e.data?.size > 0) recordChunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      const blob = new Blob(recordChunksRef.current, { type: 'video/webm' })
      // Always trigger local download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `collabstream-${Date.now()}.webm`; a.click()
      URL.revokeObjectURL(url); audioCtxRef.current?.close?.()
      // Phase E: cloud upload for Business plan
      if (userPlan === 'business') {
        try {
          const { getToken } = await import('../lib/auth.js')
          const token = await getToken()
          const form = new FormData()
          form.append('file', blob, 'recording.webm')
          const res = await fetch(`/api/sessions/${sessionId}/recording`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          })
          if (res.ok) {
            addJoinToast('Recording saved to cloud')
          }
        } catch {}
      }
    }
    recorder.start(1000); setRecording(true)
  }

  // Fix 3: stop all tracks, show recap instead of immediate navigate
  function handleEnd() {
    hostRTC.broadcast('annotation', { type: 'admin', action: 'end' })
    stopShare()
    stopLocalMedia()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    audioCtxRef.current?.close?.()
    handleRevoke()
    const h = Math.floor(elapsed / 3600)
    const m = Math.floor((elapsed % 3600) / 60)
    setRecapData({
      sessionName: sessionName || 'Session',
      duration: h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : 'under a minute',
      peakGuests: peakGuestCountRef.current,
    })
    setShowRecap(true)
  }

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Escape') { if (focusMode) { setFocusMode(false); return }; if (controlToken) { handleRevoke(); return } }
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
  }, [controlToken, setMode, toggleMute, takeSnapshot, chatOpen, focusMode])

  async function toggleLock() {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(`/session/${sessionId}/lock?token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: !locked }),
    })
    if (res.ok) setLocked((v) => !v)
  }

  const guestIds = Object.keys(guestStreams)
  const hasScreen = !!screenStream
  // Fix 8: spotlight uses guestScreenStreams OR guestStreams for focused guest
  const focusedGuestVideo = focusGuestId ? (guestScreenStreams[focusGuestId] || guestStreams[focusGuestId]) : null
  const primaryStream = hasScreen ? screenStream : (focusedGuestVideo || localStream)
  const network = useNetworkQuality(guestIds.length > 0 ? () => hostRTC.getStats(guestIds[0]) : null, 'host')
  const chatIsDocked = chatOpen && chatDock === 'docked'
  const remaining = sessionDuration * 60 - elapsed
  const expiryWarning = remaining < 900 && sessionStartRef.current
  const sessionEnded = remaining <= 0 && sessionStartRef.current
  const guestPillAmber = maxGuests && guestIds.length >= maxGuests
  const guestPillLabel = maxGuests ? `Guests (${guestIds.length}/${maxGuests}${guestPillAmber ? ' \u2014 full' : ''})` : `Guests (${guestIds.length})`
  const wbCurrentMode = mode === 'laser' ? 'laser' : (annotationTool === 'eraser' ? 'eraser' : annotationTool === 'text' ? 'text' : annotationTool === 'arrow' ? 'arrow' : 'annotate')

  // Fix 8: grid sizing
  const tileCols = guestIds.length <= 2 ? 1 : guestIds.length <= 4 ? 2 : 3
  const tileW = guestIds.length <= 2 ? 176 : guestIds.length <= 4 ? 156 : 136
  const tileH = guestIds.length <= 2 ? 99 : guestIds.length <= 4 ? 88 : 77
  const totalPages = Math.ceil(guestIds.length / GUESTS_PER_PAGE)
  const pagedGuests = guestIds.slice(guestPage * GUESTS_PER_PAGE, (guestPage + 1) * GUESTS_PER_PAGE)

  useEffect(() => { setPeerConnected(guestIds.length > 0) }, [guestIds.length, setPeerConnected])

  const overflowItems = [
    { label: locked ? 'Unlock session' : 'Lock session', onClick: toggleLock, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> },
    { label: 'Copy link', onClick: () => navigator.clipboard.writeText(guestJoinUrl(publicOrigin, joinCode || shortCode || '')), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg> },
    { label: 'Invite & QR', onClick: () => setInviteOpen(true), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { label: 'Schedule', onClick: () => setScheduleOpen(true), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
    'divider',
    { label: 'Take snapshot', onClick: takeSnapshot, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> },
    { label: 'Download audit', onClick: downloadAudit, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg> },
    { label: 'Set guest cap', onClick: () => setCapMenuOpen((v) => !v), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  ]

  if (!localStream && mediaError) {
    return <MediaPermissionScreen title="Camera and microphone needed" body="Enable access so your guest can see and hear you." error={mediaError} onRetry={requestMedia} />
  }

  return (
    <div className="h-screen app-bg flex flex-col overflow-hidden">

      {/* Fix 7: Session recap modal */}
      {showRecap && recapData && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[9999]">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-8 w-[90%] max-w-md text-center shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-zinc-100 font-mono text-base font-semibold mb-1">Session ended</h2>
            <p className="text-zinc-500 font-mono text-xs mb-6">{recapData.sessionName}</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-2xl font-mono text-zinc-100 font-semibold">{recapData.duration}</div>
                <div className="text-zinc-500 text-xs font-mono mt-1">Duration</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-2xl font-mono text-zinc-100 font-semibold">{recapData.peakGuests}</div>
                <div className="text-zinc-500 text-xs font-mono mt-1">Peak guests</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={downloadAudit}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-mono hover:bg-zinc-800 flex items-center justify-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download audit log
              </button>
              <button onClick={() => navigate('/')}
                className="w-full px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono">
                Back to home
              </button>
            </div>
          </div>
        </div>
      )}

      {controlFlash && (
        <div className="control-flash fixed inset-0 z-[9998] pointer-events-none border-4 border-red-500/60 flex items-center justify-center">
          <div className="bg-black/70 px-6 py-3 rounded-xl border border-red-500/40 text-red-200 text-sm font-mono">Guest has control &mdash; Press Esc to take back</div>
        </div>
      )}

      {!focusMode && (
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/70 glass z-20 safe-area overflow-x-auto scrollbar-none flex-nowrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.35)] flex-shrink-0">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            </div>
            <span className="font-mono text-xs text-slate-300 tracking-widest whitespace-nowrap">
              {branding?.logoUrl
                ? <img src={branding.logoUrl} alt="logo" style={{ height: 22, display: 'inline-block', verticalAlign: 'middle' }} />
                : (sessionName || 'CollabStream')
              }
            </span>
            <span className="w-px h-4 bg-slate-800 flex-shrink-0" />
            <span className="font-mono text-xs text-slate-500 whitespace-nowrap">{sessionId?.slice(0, 8)}&hellip;</span>
            {sessionStartRef.current && (
              <>
                <span className="w-px h-4 bg-slate-800 flex-shrink-0" />
                <span className={`font-mono text-xs whitespace-nowrap ${expiryWarning ? 'text-amber-300' : 'text-slate-400'}`}>
                  {formatTime(elapsed)}{expiryWarning && !sessionEnded && ` \u00b7 ${Math.ceil(remaining / 60)}m left`}{sessionEnded && ' \u00b7 Session ended'}
                </span>
              </>
            )}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <CompanionStatus />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border whitespace-nowrap ${guestPillAmber ? 'bg-amber-950/60 border-amber-800 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${peerConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className="text-xs font-mono">{peerConnected ? guestPillLabel : 'Waiting\u2026'}</span>
            </div>
            <NetworkBadge quality={network} />
            {guestOrder.length > 0 && (
              <button onClick={() => setGuestListOpen((v) => !v)} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 whitespace-nowrap">
                Guests ({guestOrder.length})
              </button>
            )}
            <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono whitespace-nowrap">Host</span>
            <OverflowMenu items={overflowItems} />
            <button onClick={handleEnd} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-900 hover:text-red-300 text-slate-400 text-xs font-mono transition-all focus-ring whitespace-nowrap">End</button>
          </div>
        </header>
      )}

      {/* Fix 5: reload warning hint */}
      {!focusMode && showReloadHint && (
        <div className="w-full text-center py-1 text-[10px] font-mono text-amber-400/50 bg-amber-950/10 transition-opacity duration-1000">
          &#9888; Refreshing will end the session for all guests
        </div>
      )}

      <SignalingBanner signalingConnected={signalingConnected} retryCount={retryCount} manualRetry={manualRetry} maxRetries={maxRetries} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 relative p-3 overflow-hidden">
          {joinToasts.map((t) => (
            <div key={t.id} className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-mono z-30 toast-enter">{t.msg}</div>
          ))}
          {peerLeft && !focusMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-800 text-amber-200 text-xs font-mono z-30">Guest left the session</div>
          )}

          {whiteboard ? (
            // Fix 2: whiteboard block with both annotation canvas AND pointer canvas
            <div className="w-full h-full bg-white relative rounded-xl overflow-hidden screen-expand">
              <WhiteboardToolbar
                onSetMode={(m) => {
                  if (m === 'eraser') { setMode('annotate'); setAnnotationTool('eraser') }
                  else if (m === 'laser') { setMode('laser'); setAnnotationTool('laser') }
                  else if (m === 'text') { setMode('annotate'); setAnnotationTool('text') }
                  else if (m === 'arrow') { setMode('annotate'); setAnnotationTool('arrow') }
                  else { setMode('annotate'); setAnnotationTool('pen') }
                }}
                onClear={handleWbClear}
                onUndo={annotation.undo}
                onDownload={handleWbDownload}
                onExit={toggleWhiteboard}
                currentMode={wbCurrentMode}
                annotationColor={annotationColor}
                onColorChange={(c) => setAnnotationColor(c)}
                strokeWidth={wbStrokeWidth}
                onStrokeWidthChange={(w) => { setWbStrokeWidth(w); setAnnotationSize(w) }}
                isHost={true}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: 'none', zIndex: 10 }}
                onPointerDown={onWbPointerDown}
                onPointerMove={annotation.onPointerMove}
                onPointerUp={annotation.onPointerUp}
              />
              {/* Fix 2: pointer canvas for laser dot on whiteboard */}
              <canvas
                ref={pointerRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 15 }}
              />
              {textInput && (
                <input
                  autoFocus
                  style={{
                    position: 'absolute', left: textInput.px, top: textInput.py,
                    background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${annotationColor}`, outline: 'none',
                    fontSize: `${16 * (wbStrokeWidth || 3) / 3}px`, color: annotationColor,
                    fontFamily: 'monospace', minWidth: 80, zIndex: 30,
                  }}
                  onBlur={(e) => commitText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitText(e.target.value); if (e.key === 'Escape') setTextInput(null) }}
                />
              )}
            </div>
          ) : hasScreen || (focusedGuestVideo && !hasScreen) ? (
            <div className={`w-full h-full ${screenExpanding ? 'screen-expand' : ''}`} onClick={() => setFitMode((m) => m === 'contain' ? 'cover' : 'contain')}>
              <ScreenView stream={primaryStream} canvasRef={canvasRef} pointerRef={pointerRef} videoRef={videoRef} muted={true} fit={fitMode}
                annotationHandlers={{ onPointerDown: annotation.onPointerDown, onPointerMove: annotation.onPointerMove, onPointerUp: annotation.onPointerUp }} />
              <canvas ref={cursorCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }} />
            </div>
          ) : (
            // Fix 4: PiP button on the "You" tile
            <div className="w-full h-full relative">
              <VideoTile stream={localStream} name="You" muted={true} label="You" />
              {document.pictureInPictureEnabled && localStream && !whiteboard && (
                <button
                  style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,0,0,0.55)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontFamily: 'monospace' }}
                  onClick={async () => {
                    const video = videoRef.current
                    if (!video) return
                    try {
                      if (document.pictureInPictureElement === video) {
                        await document.exitPictureInPicture(); setIsPiP(false)
                      } else {
                        await video.requestPictureInPicture(); setIsPiP(true)
                        video.addEventListener('leavepictureinpicture', () => setIsPiP(false), { once: true })
                      }
                    } catch {}
                  }}
                >
                  {isPiP ? 'Exit PiP' : '\u2389 PiP'}
                </button>
              )}
            </div>
          )}

          {/* Fix 8: multi-column guest tile grid with pagination */}
          {guestIds.length > 0 && !focusMode && (
            <div style={{ position: 'fixed', right: 12, bottom: 80, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {guestIds.length > 6 && (
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(251,191,36,0.6)', textAlign: 'center', marginBottom: 2 }}>
                  {guestIds.length} guests &middot; may affect performance
                </div>
              )}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <button onClick={() => setGuestPage((p) => Math.max(0, p - 1))} disabled={guestPage === 0} style={{ fontSize: 14, fontFamily: 'monospace', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', opacity: guestPage === 0 ? 0.3 : 1 }}>&#8249;</button>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>{guestPage + 1}/{totalPages}</span>
                  <button onClick={() => setGuestPage((p) => Math.min(totalPages - 1, p + 1))} disabled={guestPage >= totalPages - 1} style={{ fontSize: 14, fontFamily: 'monospace', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', opacity: guestPage >= totalPages - 1 ? 0.3 : 1 }}>&#8250;</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tileCols}, ${tileW}px)`, gap: 4 }}>
                {pagedGuests.map((gid, idx) => {
                  const isFocused = gid === focusGuestId
                  return (
                    <div
                      key={gid}
                      onClick={() => setFocusGuestId(isFocused ? null : gid)}
                      style={{ width: tileW, height: tileH, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flexShrink: 0, outline: isFocused ? '2px solid #22d3ee' : '1px solid rgba(255,255,255,0.07)', transition: 'outline 0.15s' }}
                    >
                      <VideoFeed stream={guestStreams[gid]} name={guestNames[gid] || `Guest ${guestPage * GUESTS_PER_PAGE + idx + 1}`} label={guestNames[gid] || `Guest ${guestPage * GUESTS_PER_PAGE + idx + 1}`} muted={false} corner="br" inline={true} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {guestIds.map((gid) => <RemoteAudio key={gid} stream={guestStreams[gid]} />)}

          {reactions.map((r) => (
            <div key={r.id} className="reaction-float fixed pointer-events-none z-[9990] text-2xl" style={{ bottom: 80, left: `${r.x}%` }}>{r.emoji}</div>
          ))}

          {focusHint && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 border border-slate-700 text-slate-300 text-xs font-mono animate-fade-in">Press F to exit focus mode</div>
          )}
        </main>

        {chatIsDocked && !focusMode && (
          <ChatPanel messages={chat.messages} onSend={chat.send} onSendFile={chat.sendFile} onClose={closeChat} onOpen={() => setUnreadCount(0)}
            targets={guestOrder.map((gid, i) => ({ id: gid, label: guestNames[gid] || `Guest ${i + 1}` }))}
            selectedTarget={chatTarget} onTargetChange={setChatTarget} unreadCount={unreadCount} myRole="host"
            initialDock="docked" onDockChange={setChatDock} />
        )}
      </div>

      {!focusMode && (
        <footer className="flex items-center px-0 py-0 border-t border-slate-800/70 glass z-20 safe-area">
          <div className="relative flex items-center flex-1 min-w-0">
            {canScrollLeft && (
              <button onClick={() => footerScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
                className="absolute left-0 z-10 h-full px-2 bg-gradient-to-r from-zinc-950 to-transparent text-slate-400 hover:text-slate-200 flex items-center text-lg leading-none">&#8249;</button>
            )}
            <div ref={footerScrollRef} className="flex items-center gap-2 overflow-x-auto scrollbar-none px-4 py-3 min-w-0">
              <AudioControls onToggleMute={toggleMute} />
              <button onClick={toggleNoiseSupp} className={`flex-shrink-0 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${noiseSupp ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-amber-950/30 border-amber-700 text-amber-200'}`}>{noiseSupp ? 'NS On' : 'NS Off'}</button>
              <button onClick={toggleVideo} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${videoEnabled ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-red-950/40 border-red-800 text-red-200'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                {videoEnabled ? 'Camera On' : 'Camera Off'}
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={handleShare} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${sharing ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M12 10l3-3m0 0l3 3m-3-3v8" /></svg>
                  {sharing ? 'Stop sharing' : 'Share screen'}
                </button>
                <select value={shareQuality.label} onChange={(e) => setShareQuality(SHARE_QUALITIES.find((q) => q.label === e.target.value) || SHARE_QUALITIES[0])}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none font-mono flex-shrink-0">
                  {SHARE_QUALITIES.map((q) => <option key={q.label} value={q.label}>{q.label}</option>)}
                </select>
              </div>
              <button onClick={toggleWhiteboard} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${whiteboard ? 'bg-white/10 border-white/30 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 17 2-2 4-4-2-2-4 4-2 2h2zm7-9-2-2" /></svg>
                {whiteboard ? 'Exit Whiteboard' : 'Whiteboard'}
              </button>
              <button onClick={handleRecord} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${userPlan === 'free' ? 'bg-slate-950 border-slate-800 text-slate-600' : recording ? 'bg-red-600/20 border-red-500 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={recording ? '#ef4444' : 'none'} stroke={recording ? '#ef4444' : 'currentColor'} strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
                {userPlan === 'free' ? 'Record (Pro)' : recording ? 'Stop Rec' : 'Record'}
              </button>
              {flags.chat && (
                <div className="relative flex-shrink-0">
                  <button onClick={chatOpen ? closeChat : openChat} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono transition-all whitespace-nowrap ${chatOpen ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    Chat
                  </button>
                  {unreadCount > 0 && !chatOpen && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-mono rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </div>
              )}
              <button onClick={() => setShortcutsOpen(true)} className="flex-shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
              </button>
            </div>
            {canScrollRight && (
              <button onClick={() => footerScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
                className="absolute right-0 z-10 h-full px-2 bg-gradient-to-l from-zinc-950 to-transparent text-slate-400 hover:text-slate-200 flex items-center text-lg leading-none">&#8250;</button>
            )}
          </div>
          <div className="w-px h-8 bg-slate-800 flex-shrink-0" />
          <div className="flex-shrink-0 px-4 py-3">
            <ControlBar onGrant={handleGrant} onRevoke={handleRevoke} forceDisabled={!controlSupported || !flags.control}
              disabledReason={!flags.control ? 'Control is disabled' : !controlSupported ? 'Desktop only' : undefined} />
          </div>
        </footer>
      )}

      {/* Fix 6: guest list with Unmute all + mic icons per guest */}
      {guestListOpen && guestOrder.length > 0 && !focusMode && (
        <div className="absolute left-4 top-20 slide-in-left bg-zinc-950/90 border border-zinc-800 rounded-xl p-3 text-xs font-mono z-30 max-w-[80vw]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-zinc-400">Guests ({guestOrder.length}{maxGuests ? `/${maxGuests}` : ''})</div>
            <div className="flex items-center gap-1">
              <button onClick={handleMuteAll} className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Mute all</button>
              <button onClick={handleUnmuteAll} className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Unmute all</button>
              <button onClick={() => setGuestListOpen(false)} className="text-zinc-500 hover:text-zinc-200 px-1 ml-1">&#x2715;</button>
            </div>
          </div>
          <div className="space-y-2">
            {guestOrder.map((gid, idx) => {
              const micMuted = !!guestAudioMuted[gid]
              return (
                <div key={gid} className="flex items-center justify-between gap-3">
                  <div className="text-zinc-300 flex items-center gap-1.5">
                    <span className={micMuted ? 'text-red-400' : 'text-emerald-400'} style={{ display: 'flex', alignItems: 'center' }}>
                      {micMuted ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="1" y1="1" x2="23" y2="23" />
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                        </svg>
                      )}
                    </span>
                    {guestNames[gid] || `Guest ${idx + 1}`}
                    {raisedHands[gid] && <span className="ml-1 text-amber-300">✋</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {raisedHands[gid] && <button onClick={() => handleAllowSpeak(gid)} className="px-2 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-200">Allow</button>}
                    <button onClick={() => { const m = !guestAudioMuted[gid]; setGuestAudioMuted((x) => ({ ...x, [gid]: m })); hostRTC.setRemoteAudio(gid, !m) }} className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                      {guestAudioMuted[gid] ? 'Unmute' : 'Mute'}
                    </button>
                    <button onClick={() => { hostRTC.sendToPeer(gid, 'annotation', { type: 'admin', action: 'kick' }); hostRTC.closePeer(gid); setGuestStreams((s) => { const n = { ...s }; delete n[gid]; return n }); setGuestOrder((o) => o.filter((id) => id !== gid)) }} className="px-2 py-1 rounded bg-red-950 border border-red-800 text-red-200">Kick</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {capMenuOpen && (
        <div className="absolute right-4 top-16 modal-enter bg-slate-950 border border-slate-800 rounded-xl p-3 z-50 shadow-xl">
          <div className="text-xs font-mono text-slate-400 mb-2">Set guest cap</div>
          <div className="flex flex-col gap-1">
            {[2, 3, 5, 10, 20].filter((n) => userPlan === 'business' || n <= (userPlan === 'pro' ? 10 : 3)).map((n) => (
              <button key={String(n)} onClick={() => updateCap(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono text-left ${maxGuests === n ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                {n === null ? 'Unlimited' : `${n} guests`}
                {guestOrder.length > (n || 9999) && <span className="ml-2 text-amber-400 text-[10px]">(below current)</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setCapMenuOpen(false)} className="mt-2 w-full text-xs font-mono text-slate-500 hover:text-slate-200">Cancel</button>
        </div>
      )}

      {chatOpen && !chatIsDocked && !focusMode && (
        <ChatPanel messages={chat.messages} onSend={chat.send} onSendFile={chat.sendFile} onClose={closeChat} onOpen={() => setUnreadCount(0)}
          targets={guestOrder.map((gid, i) => ({ id: gid, label: guestNames[gid] || `Guest ${i + 1}` }))}
          selectedTarget={chatTarget} onTargetChange={setChatTarget} unreadCount={unreadCount} myRole="host"
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
                {[['?','Toggle this help'],['Esc','Revoke control / exit focus'],['F','Focus mode'],['D','Draw mode'],['L','Laser mode'],['M','Mute mic'],['C','Toggle chat'],['S','Snapshot']].map(([k, d]) => (
                  <tr key={k} className="border-b border-slate-800/50"><td className="py-1.5 pr-4 text-cyan-300">{k}</td><td className="py-1.5 text-slate-400">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {knockQueue.length > 0 && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 className="text-zinc-100 text-sm font-mono mb-1">Someone wants to join</h3>
            <p className="text-zinc-400 text-xs font-mono mb-4">
              <span className="text-zinc-200">{knockQueue[0].name || 'Guest'}</span> is requesting access.
              {knockQueue.length > 1 && <span className="text-zinc-500 ml-1">({knockQueue.length - 1} more waiting)</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={admitKnock} className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-mono">Admit</button>
              <button onClick={rejectKnock} className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Decline</button>
            </div>
          </div>
        </div>
      )}

      {pendingControlPeerId && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 className="text-zinc-100 text-sm font-mono mb-2">Guest requests control</h3>
            <p className="text-zinc-500 text-xs mb-4">Approve to give full control. Press Esc anytime to take back.</p>
            <div className="flex gap-2">
              <button onClick={handleGrant} className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-mono">Approve</button>
              <button onClick={() => { if (pendingControlPeerId) hostRTC.sendToPeer(pendingControlPeerId, 'control', { type: 'control', action: 'deny' }); setPendingControlPeerId(null) }} className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Deny</button>
            </div>
          </div>
        </div>
      )}

      {pendingSharePeerId && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 className="text-zinc-100 text-sm font-mono mb-2">Guest requests screen share</h3>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { hostRTC.sendToPeer(pendingSharePeerId, 'annotation', { type: 'screen', action: 'approve' }); setPendingSharePeerId(null) }} className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-mono">Approve</button>
              <button onClick={() => { hostRTC.sendToPeer(pendingSharePeerId, 'annotation', { type: 'screen', action: 'deny' }); setPendingSharePeerId(null) }} className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono">Deny</button>
            </div>
          </div>
        </div>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} joinCode={joinCode} shortCode={shortCode}
        joinUrl={guestJoinUrl(publicOrigin, joinCode || shortCode || '')}
        lanUrl={lanOrigin ? guestJoinUrl(lanOrigin, joinCode || shortCode || '') : null}
        invalid={!joinValid && joinCode} title={sessionName} />
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} joinUrl={guestJoinUrl(publicOrigin, joinCode || shortCode || '')} />
      <OnboardingTips role="host" tips={['Share your screen to start.', 'Press ? for shortcuts.', 'Press F for focus mode.']} />
      <CreatorSignature variant="console" projectName="CollabStream" />
    </div>
  )
}
