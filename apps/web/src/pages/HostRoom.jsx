import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import useSession from '../store/session.js'
import useSignaling from '../hooks/useSignaling.js'
import useWebRTCHost from '../hooks/useWebRTCHost.js'
import CreatorSignature from '../components/CreatorSignature.jsx'
import Baton, { BatonActionButton } from '../components/Baton.jsx'
import useAudio from '../hooks/useAudio.js'
import useScreenShare, { SHARE_QUALITIES } from '../hooks/useScreenShare.js'
import useAnnotation from '../hooks/useAnnotation.js'
import useCompanion from '../hooks/useCompanion.js'
import useChat from '../hooks/useChat.js'
import useCaptions from '../hooks/useCaptions.js'
import ScreenView from '../components/ScreenView.jsx'
import VideoFeed from '../components/VideoFeed.jsx'
import VideoTile from '../components/VideoTile.jsx'
import ControlBar from '../components/ControlBar.jsx'
import CompanionStatus from '../components/CompanionStatus.jsx'
import AudioControls from '../components/AudioControls.jsx'
import SidePanel from '../components/SidePanel.jsx'
import WhiteboardToolbar from '../components/WhiteboardToolbar.jsx'
import { getPublicOrigin, guestJoinUrl, resolveJoinCode } from '../lib/session.js'
import { apiUrl } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import RemoteAudio from '../components/RemoteAudio.jsx'
import CaptionsOverlay from '../components/CaptionsOverlay.jsx'
import MediaPermissionScreen from '../components/MediaPermissionScreen.jsx'
import useSnapshot from '../hooks/useSnapshot.js'
import useNetworkQuality from '../hooks/useNetworkQuality.js'
import useActiveSpeaker from '../hooks/useActiveSpeaker.js'
import NetworkBadge from '../components/NetworkBadge.jsx'
import OnboardingTips from '../components/OnboardingTips.jsx'
import HelpGuide from '../components/HelpGuide.jsx'
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
// setTimeout so modal state updates fire OUTSIDE the event batch.
//
// The dropdown itself is rendered through a portal to document.body at a
// fixed position computed from the trigger button's own bounding rect,
// rather than as a normal `position: absolute` child of this component.
// This button lives inside the header, which has `overflow-x-auto` for
// horizontal scrolling on narrow screens - and per the CSS spec, setting
// overflow-x to anything other than visible forces the paired overflow-y
// axis to also clip, even though it's never set explicitly. A z-index of
// 9999 can't rescue an absolutely-positioned dropdown from that: clipping
// happens before stacking/paint, so the menu was opening (state genuinely
// flipped) but rendering invisible/cut off by the header's own bounds -
// which looks identical to "the button doesn't work" from the outside.
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function onOutside(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      if (btnRef.current && btnRef.current.contains(e.target)) return
      setOpen(false)
    }
    if (open) document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [open])

  function toggle(e) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setOpen((v) => !v)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onMouseDown={toggle}
        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono hover:bg-slate-800 focus-ring"
      >
        &middot;&middot;&middot;
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="modal-enter bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-[9999] min-w-[210px] py-1 overflow-hidden"
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
        </div>,
        document.body
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

  const [sharing, setSharing] = useState(false)
  const [shareQuality, setShareQuality] = useState(SHARE_QUALITIES[0])
  const [whiteboard, setWhiteboard] = useState(false)
  const [wbStrokeWidth, setWbStrokeWidth] = useState(3)
  // Persistent whiteboards (found gap, now built - backend already existed
  // with zero UI; see docs/floor-mode-plan.md)
  const [boardsOpen, setBoardsOpen] = useState(false)
  const [savedBoards, setSavedBoards] = useState([])
  const [boardsLoading, setBoardsLoading] = useState(false)
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [newBoardName, setNewBoardName] = useState('')
  const [boardSaving, setBoardSaving] = useState(false)
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
  const [floorPeerId, setFloorPeerId] = useState(null)
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
  // Knock panel (moved off-center, see comment above the panel JSX below
  // for why): open/closed state for the side panel, plus a snooze window
  // so a host mid-conversation isn't interrupted by every single knock
  // toast. knockMutedUntilRef exists alongside the state twin because the
  // WS message handler below is a plain inline callback re-created every
  // render - reading the ref avoids any risk of a stale closure over
  // knockMutedUntil specifically in that one callback.
  const [knockPanelOpen, setKnockPanelOpen] = useState(false)
  const [knockMutedUntil, setKnockMutedUntilState] = useState(0)
  const knockMutedUntilRef = useRef(0)
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)
  const [expandedKnockPeerId, setExpandedKnockPeerId] = useState(null)
  function setKnockMutedUntil(ts) { knockMutedUntilRef.current = ts; setKnockMutedUntilState(ts) }
  // Waiting-room chat (see docs/waiting-room-chat-plan.md) - keyed by
  // pending guest peerId, separate from in-call chat's messages. Sent over
  // the raw signaling WebSocket (signalingWrite), same transport as the
  // knock itself, since the pending guest has no WebRTC data channel yet.
  const [waitingChatByPeer, setWaitingChatByPeer] = useState({})
  const [waitingChatInput, setWaitingChatInput] = useState('')
  // Co-host / assisted moderation (see docs/co-host-plan.md, Option A).
  // Set of guest peerIds this host has promoted. Bookkeeping mirrors
  // rooms.js's coHostPeerIds - kept here too so the UI can render badges
  // and the guest-list buttons without a round trip.
  const [coHostPeerIds, setCoHostPeerIds] = useState(() => new Set())
  const [chatOpen, setChatOpen] = useState(false)
  // Redesign side panel (collabstream-redesign.html): replaces the old
  // separate docked/floating ChatPanel AND the separate "Guests" popover
  // with one consistent tabbed panel. `chatOpen`/`guestListOpen` still
  // independently control the panel's overall visibility (unchanged, so
  // every existing keyboard shortcut / unread-badge / toast wiring tied to
  // them keeps working); `sideTab` just tracks which tab shows once it's
  // open. Private chat targeting is still handled by the active SidePanel.
  const [sideTab, setSideTab] = useState('chat')
  const [chatTarget, setChatTarget] = useState('all')
  const [unreadCount, setUnreadCount] = useState(0)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [captions, setCaptions] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const sessionStartRef = useRef(null)
  const prevGuestCountRef = useRef(0)
  const peakGuestCountRef = useRef(0)  // Fix 7
  const [guestListOpen, setGuestListOpen] = useState(false)
  const [reactions, setReactions] = useState([])
  const [controlFlash, setControlFlash] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). null = not yet known
  // (assume live to avoid an unnecessary delay for the overwhelmingly
  // common non-scheduled case - see the requestMedia effect below), false
  // = genuinely in the lobby, true = live. Sourced first from the existing
  // /session/:id REST fetch below (fast, already happening anyway), then
  // kept fresh by the WS 'registered'/'call-started' messages.
  const [sessionStarted, setSessionStarted] = useState(null)
  const [lobbyGuests, setLobbyGuestsState] = useState([])
  const lobbyGuestsRef = useRef([])
  function setLobbyGuests(guests) { lobbyGuestsRef.current = guests; setLobbyGuestsState(guests) }
  const [lobbyMessages, setLobbyMessages] = useState([])
  const [lobbyChatInput, setLobbyChatInput] = useState('')

  // Footer buttons wrap onto a second row on narrow screens instead of
  // requiring horizontal scrolling - tapping an edge arrow to sideways-
  // scroll through a toolbar is not how anyone expects a button bar to
  // work, especially on a phone. This replaces the old scroll-track/arrow-
  // button apparatus entirely.

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
    mode, branding, userPlan, companionConnected,
    stopLocalMedia,
  } = useSession()

  // Fix 5: beforeunload reload guard
  useEffect(() => {
    function guard(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])

  // Camera/mic can stay on (OS-level indicator light included) even after
  // the session visibly "ends," because React's unmount-cleanup effect
  // (stopLocalMedia in the effect below) isn't guaranteed to run to
  // completion on a hard tab close or reload - the browser can tear down
  // the JS context mid-cleanup. beforeunload above only shows a
  // confirmation prompt; it never actually stops anything. pagehide IS
  // reliably fired by the browser before a tab closes/navigates (unlike
  // unload, which is unreliable on mobile and increasingly discouraged),
  // so this calls stopLocalMedia directly as a redundant, more trustworthy
  // safety net alongside the existing unmount cleanup and handleEnd's own
  // explicit call.
  useEffect(() => {
    function onPageHide() { stopLocalMedia() }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [stopLocalMedia])

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

  useEffect(() => {
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): don't request the
    // camera/mic while sitting in the lobby - the lobby is deliberately
    // text-only (chat, not video) for every participant, so there's no
    // reason to hold the camera open, possibly for hours, before the host
    // actually starts the call. Fires immediately for the null (not-yet-
    // known) and true (live) cases, matching existing behavior exactly for
    // every non-scheduled session.
    if (sessionStarted === false) return
    requestMedia()
  }, [requestMedia, sessionStarted])

  // Fix 3: stop tracks on unmount
  useEffect(() => {
    return () => { stopLocalMedia() }
  }, [stopLocalMedia])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    fetch(apiUrl(`/session/${sessionId}?token=${encodeURIComponent(token)}`))
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setLocked(!!d.locked); setJoinCode(d.joinCode || null); setShortCode(d.shortCode || null)
        setSessionDuration(d.durationMinutes || 120); setMaxGuests(d.maxGuests || null)
        // Pre-launch lobby (docs/pre-launch-lobby-plan.md): this REST call
        // was already happening for the fields above, so it's the fastest
        // source for `started` too - avoids waiting on the WS round trip
        // just to find out whether the camera should even be requested.
        setSessionStarted(d.started !== false)
      })
      .catch(() => navigate('/'))
    setInviteOpen(true)
  }, [sessionId])

  useEffect(() => {
    getPublicOrigin().then((origin) => {
      const safeOrigin = typeof origin === 'string' && origin ? origin.replace(/\/$/, '') : window.location.origin
      setPublicOrigin(safeOrigin)
      if (safeOrigin.includes('ngrok') || safeOrigin.includes('ngrok-free')) {
        fetch(apiUrl('/public-host')).then((r) => r.json()).then((d) => { if (d?.origin) setLanOrigin(d.origin.replace(/\/$/, '')) }).catch(() => {})
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

  // Fix 2: sync canvas pixel dimensions to display size, re-sync when whiteboard opens.
  // Also repaints from stroke history after every resize - setting
  // canvas.width/height always clears the canvas as a side effect, and
  // without a redraw afterward the whiteboard silently lost everything
  // drawn on it the moment the window was resized.
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
        // If the guest who just disconnected held the floor, clear the UI
        // state too - hostRTC.closePeer already tore down the actual audio
        // relay to everyone else, this just keeps the banner/button state
        // in sync with it (see docs/floor-mode-plan.md).
        setFloorPeerId((f) => (f === peerId ? null : f))
        // Same idea for co-host status (docs/co-host-plan.md) - a
        // disconnected guest shouldn't keep a moderator badge if they
        // reconnect as a fresh peerId later.
        setCoHostPeerIds((s) => { if (!s.has(peerId)) return s; const n = new Set(s); n.delete(peerId); return n })
      }
    },
  })

  const sendAll = useCallback((channel, msg, exceptPeerId) => hostRTC.broadcast(channel, msg, exceptPeerId), [hostRTC])
  // Chat needs to be able to target ONE specific guest privately (the
  // Everyone/[Guest] selector in ChatPanel) as well as broadcast to
  // everyone - this used to be entirely decorative: selecting a guest had
  // zero effect because chat always broadcast via sendAll regardless of
  // what was selected. This dispatcher actually respects the target.
  const chatDispatch = useCallback((channel, msg, target) => {
    if (target && target !== 'all') hostRTC.sendToPeer(target, channel, msg)
    else hostRTC.broadcast(channel, msg)
  }, [hostRTC])
  const { toggleMute, handleAudioEvent } = useAudio(sendAll)
  const annotation = useAnnotation(canvasRef, pointerRef, sendAll, 'host')
  const { takeSnapshot } = useSnapshot(videoRef, canvasRef)
  const chat = useChat(chatDispatch, 'host')

  const addCaption = useCallback((caption) => {
    const id = caption.id || `${Date.now()}-${Math.random()}`
    setCaptions((items) => [...items.slice(-5), { id, ts: Date.now(), ...caption }])
    setTimeout(() => setCaptions((items) => items.filter((item) => item.id !== id)), 8000)
  }, [])

  const captionsHook = useCaptions(useCallback((text) => {
    const msg = { type: 'caption', text, from: 'Host', fromPeerId: 'host', ts: Date.now() }
    addCaption(msg)
    hostRTC.broadcast('annotation', msg)
  }, [addCaption, hostRTC]))

  const toggleCaptions = useCallback(() => {
    if (captionsHook.listening) {
      captionsHook.stop()
      setCaptionsEnabled(false)
      return
    }
    const started = captionsHook.start()
    if (started) setCaptionsEnabled(true)
  }, [captionsHook])

  const broadcastRoster = useCallback(() => {
    const roster = guestOrder.map((gid, idx) => ({ id: gid, name: guestNames[gid] || `Guest ${idx + 1}`, hand: !!raisedHands[gid], cohost: coHostPeerIds.has(gid) }))
    hostRTC.broadcast('annotation', { type: 'roster', guests: roster, count: guestOrder.length, queue: handQueue })
  }, [guestOrder, guestNames, raisedHands, handQueue, hostRTC, coHostPeerIds])

  useEffect(() => { if (guestOrder.length > 0) broadcastRoster() }, [guestOrder, guestNames, raisedHands, coHostPeerIds, broadcastRoster])

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
    // Routed through addTextStamp so text participates in undo/clear/resize
    // redraw like every other stroke - see useAnnotation.js. This also
    // broadcasts it over the wire using the existing generic stroke-relay
    // path, so no separate 'text-stamp' handling is needed on the receiving
    // end anymore.
    annotation.addTextStamp(textInput.x, textInput.y, value, annotationColor, wbStrokeWidth)
    setTextInput(null)
  }

  const handleDataMessage = useCallback((msg, peerId) => {
    if (msg.type === 'draw' || msg.type === 'clear' || msg.type === 'stroke' || msg.type === 'laser' || msg.type === 'undo') {
      annotation.handleRemoteDraw(msg); hostRTC.broadcast('annotation', msg, peerId)
    }
    if (msg.type === 'wb-clear') { annotation.clearCanvasLocal(); hostRTC.broadcast('annotation', msg, peerId) }
    if (msg.type === 'input' && controlToken && peerId === controlPeerId) companion.forwardInput(controlToken, msg)
    if (msg.type === 'admin' && msg.action === 'name' && msg.name) { setGuestNames((n) => ({ ...n, [peerId]: msg.name })); addJoinToast(`${msg.name} joined`) }
    if (msg.type === 'admin' && msg.action === 'leave') addJoinToast(`${guestNames[peerId] || 'Guest'} left the session`)
    if (msg.type === 'hand') {
      if (msg.action === 'raise') { setRaisedHands((h) => ({ ...h, [peerId]: true })); setHandQueue((q) => q.includes(peerId) ? q : [...q, peerId]) }
      if (msg.action === 'lower') { setRaisedHands((h) => { const n = { ...h }; delete n[peerId]; return n }); setHandQueue((q) => q.filter((id) => id !== peerId)) }
    }
    if (msg.type === 'floor-request') {
      // Distinct, more prominent signal than a plain hand-raise (see
      // docs/floor-mode-plan.md) - raising a hand already queues them for
      // "Allow" (unmute-for-host-only), this specifically flags "they want
      // everyone to hear them," surfaced as its own toast so it doesn't get
      // lost among ordinary hand-raises.
      addJoinToast(`?? ${guestNames[peerId] || 'Guest'} is requesting the floor`)
    }
    if (msg.type === 'cohost-action') {
      // Co-host / assisted moderation (see docs/co-host-plan.md, Option A).
      // A promoted guest's moderator UI sent this over the data channel
      // instead of calling anything directly - only THIS host's tab holds
      // the actual RTCPeerConnections, so the co-host's request has to be
      // re-dispatched to the exact same functions the host's own buttons
      // call. No new logic lives here, just a second caller, and only for
      // a guest actually still holding the co-host badge (server-verified
      // badge, checked again client-side in case state has drifted) -
      // guarding against a stale/forged message from a since-demoted or
      // never-promoted guest.
      if (!coHostPeerIds.has(peerId)) return
      if (msg.action === 'kick') handleKick(msg.targetPeerId, false)
      if (msg.action === 'ban') handleKick(msg.targetPeerId, true)
      if (msg.action === 'mute') { hostRTC.setRemoteAudio(msg.targetPeerId, false); setGuestAudioMuted((m) => ({ ...m, [msg.targetPeerId]: true })) }
      if (msg.action === 'unmute') handleAllowSpeak(msg.targetPeerId)
      return
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
      // useChat.js tags every outgoing message with the sender's static
      // ROLE ('guest'), not their identity - fine for a guest's own view
      // (there's only one host), but useless on the host's side with more
      // than one guest: every message showed up labeled simply "guest",
      // with zero way to tell who actually sent what. The host is the only
      // side that knows the peerId -> name mapping (guestNames), so it's
      // resolved here, once, right as each message arrives - not in
      // useChat.js, which has no concept of other guests at all. Only
      // 'chat' and 'file-start' carry a `from` that ChatPanel actually
      // displays (file-chunk/file-end just carry transferId, and file-end's
      // final message reuses the name captured off file-start in
      // useChat.js's fileBuffers), so only those two are rewritten.
      const withSender = (msg.type === 'chat' || msg.type === 'file-start')
        ? { ...msg, from: guestNames[peerId] || 'Guest' }
        : msg
      chat.handle(withSender)
      if (!chatOpen) { setUnreadCount((c) => c + 1); playChatMessage() }
    }
    if (msg.type === 'caption' && msg.text) {
      const withSender = {
        ...msg,
        from: guestNames[peerId] || msg.from || 'Guest',
        fromPeerId: peerId,
        id: `${peerId}-${msg.ts || Date.now()}-${Math.random()}`,
      }
      addCaption(withSender)
      hostRTC.broadcast('annotation', withSender, peerId)
    }
    handleAudioEvent(msg)
  }, [annotation, companion, controlToken, handleAudioEvent, controlPeerId, controlSupported, hostRTC, chat, chatOpen, addJoinToast, guestNames, addCaption])

  const { send: signalingWrite, retryCount, manualRetry, maxRetries } = useSignaling(sessionId, 'host', (msg) => {
    if (msg.type === 'admin' && msg.action === 'end') {
      stopShare()
      stopLocalMedia()
      navigate('/')
      return
    }
    if (msg.type === 'peer-left') setPeerLeft(true)
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): the WS 'registered'
    // response is a second, authoritative source for `started` - kept
    // fresh here in case it disagrees with the REST snapshot fetched
    // earlier (e.g. the host started the call from a different tab in the
    // brief window between that fetch and this WS connecting).
    if (msg.type === 'registered' && typeof msg.started === 'boolean') setSessionStarted(msg.started)
    if (msg.type === 'lobby-roster') { setLobbyGuests(msg.guests || []); return }
    if (msg.type === 'lobby-chat') {
      // fromPeerId is 'host' only when this host sent it from ANOTHER
      // connection (rare - e.g. a second tab) since relay.js never echoes
      // a sender's own message back to them; this host's own sends are
      // added directly to lobbyMessages in sendLobbyChat below, not via
      // this handler. Otherwise, resolve the guest's display name from the
      // roster we already have (falls back to 'Guest' if the roster
      // broadcast hasn't caught up yet, which self-corrects on the next one).
      const name = msg.fromPeerId === 'host' ? 'Host' : (lobbyGuestsRef.current.find((g) => g.peerId === msg.fromPeerId)?.name || 'Guest')
      setLobbyMessages((m) => [...m, { from: name, text: msg.text, t: Date.now() }])
      return
    }
    if (msg.type === 'call-started') {
      // Flipping this triggers the requestMedia effect above to finally
      // request the camera/mic, and the component re-renders past the
      // lobby early-return into the normal live view.
      setSessionStarted(true)
      return
    }
    if (msg.type === 'knock') {
      setKnockQueue((q) => [...q, { peerId: msg.peerId, name: msg.name || 'Guest', arrivedAt: Date.now() }])
      // Non-blocking by design (see the knock panel JSX below for the full
      // reasoning) - a toast, not a modal that steals focus mid-session.
      // Respects the snooze window so a host who's mid-conversation isn't
      // interrupted by every single knock; the badge count and panel stay
      // accurate regardless of whether the toast fired.
      if (Date.now() >= knockMutedUntilRef.current) {
        addJoinToast(`?? ${msg.name || 'Someone'} is waiting to join`)
      }
    }
    if (msg.type === 'waiting-chat' && msg.peerId) {
      setWaitingChatByPeer((m) => ({
        ...m,
        [msg.peerId]: [...(m[msg.peerId] || []), { from: 'guest', text: msg.text, t: Date.now() }],
      }))
      return
    }
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

  // Server-authoritative kick (design idea ?3.1): tells the signaling
  // server to revoke this guest's individual token (and, with ban:true,
  // block their IP from getting a new one), then tears down the local
  // WebRTC connection immediately rather than waiting for that to happen
  // as a side effect of the WS closing.
  function handleKick(peerId, ban = false) {
    signalingWrite({ type: 'kick', peerId, ban })
    hostRTC.closePeer(peerId)
    setGuestStreams((s) => { const n = { ...s }; delete n[peerId]; return n })
    setGuestOrder((o) => o.filter((id) => id !== peerId))
    if (floorPeerId === peerId) setFloorPeerId(null)
    // A kicked guest shouldn't keep a moderator badge - mirrors the
    // server's own defense-in-depth demoteCoHost call in relay.js's kick
    // handler (see docs/co-host-plan.md).
    setCoHostPeerIds((s) => { if (!s.has(peerId)) return s; const n = new Set(s); n.delete(peerId); return n })
    addJoinToast(`${guestNames[peerId] || 'Guest'} ${ban ? 'banned' : 'removed'}`)
  }

  // Co-host / assisted moderation (see docs/co-host-plan.md, Option A).
  // Promoting/demoting is server-side bookkeeping + audit trail only - it
  // does not by itself grant the co-host anything. What actually lets a
  // co-host act is that once promoted, HostRoom.jsx broadcasts a roster
  // update (see broadcastRoster below) including the co-host list, and
  // GuestRoom.jsx shows moderator buttons to whichever guest sees their own
  // peerId in that list. Those buttons send 'cohost-action' over the data
  // channel, which handleDataMessage above re-dispatches to handleKick /
  // handleAllowSpeak - exactly as if the host had clicked the button.
  function handlePromoteCoHost(peerId) {
    signalingWrite({ type: 'promote-cohost', peerId })
    setCoHostPeerIds((s) => new Set(s).add(peerId))
    addJoinToast(`${guestNames[peerId] || 'Guest'} is now a co-host`)
  }

  function handleDemoteCoHost(peerId) {
    signalingWrite({ type: 'demote-cohost', peerId })
    setCoHostPeerIds((s) => { if (!s.has(peerId)) return s; const n = new Set(s); n.delete(peerId); return n })
    addJoinToast(`${guestNames[peerId] || 'Guest'} is no longer a co-host`)
  }

  // Floor mode (see docs/floor-mode-plan.md): grants everyone-can-hear-them
  // access to one guest at a time. Distinct from "Allow" above, which only
  // unmutes that guest for the host. Granting the floor also makes sure the
  // guest isn't muted for the host - grantFloor relays the exact same
  // underlying inbound audio track that the Mute button's .enabled flag
  // controls, so a muted-for-host guest would otherwise be silently
  // inaudible to everyone else too, even though the grant "succeeded."
  function handleGrantFloor(peerId) {
    const ok = hostRTC.grantFloor(peerId)
    if (!ok) { addJoinToast('Could not grant the floor yet - try again in a moment'); return }
    hostRTC.setRemoteAudio(peerId, true)
    setGuestAudioMuted((m) => ({ ...m, [peerId]: false }))
    setFloorPeerId(peerId)
    hostRTC.broadcast('annotation', { type: 'floor-grant', peerId, name: guestNames[peerId] || 'Guest' })
    signalingWrite({ type: 'floor-grant', peerId })
    setRaisedHands((h) => { const n = { ...h }; delete n[peerId]; return n })
    setHandQueue((q) => q.filter((id) => id !== peerId))
  }

  function handleRevokeFloor() {
    if (!floorPeerId) return
    hostRTC.revokeFloor()
    hostRTC.broadcast('annotation', { type: 'floor-revoke' })
    signalingWrite({ type: 'floor-revoke' })
    setFloorPeerId(null)
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
    // The whiteboard and the screen-share annotation overlay share the same
    // canvas/stroke-history under the hood. Without clearing on toggle,
    // old screen-share annotations would bleed onto a freshly-opened
    // "blank" whiteboard (and vice versa) - confusing, and very unlikely to
    // be what anyone expects from a toggle. Clearing both directions makes
    // each surface start blank, which is what the UI already visually
    // implies (whiteboard renders as a plain white canvas).
    annotation.clearCanvasLocal()
    setWhiteboard(next)
    setActiveBoardId(null)
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

  // Persistent whiteboards
  // The /api/whiteboards CRUD API already existed server-side (Business
  // plan) with no UI calling it - this is that UI. See docs/floor-mode-plan.md.
  async function loadSavedBoards() {
    if (userPlan !== 'business') return
    setBoardsLoading(true)
    const token = await getToken()
    const res = await fetch(apiUrl('/api/whiteboards'), { headers: { Authorization: `Bearer ${token}` } })
    setBoardsLoading(false)
    if (res.ok) { const { whiteboards } = await res.json(); setSavedBoards(whiteboards || []) }
  }

  function openBoardsPanel() {
    setBoardsOpen(true)
    loadSavedBoards()
  }

  async function saveBoardAs(name) {
    if (!name?.trim()) return
    setBoardSaving(true)
    const token = await getToken()
    const res = await fetch(apiUrl('/api/whiteboards'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (res.ok) {
      const { whiteboard } = await res.json()
      // Immediately persist the current strokes into the newly created board
      // rather than leaving it empty until the next explicit save.
      await fetch(apiUrl(`/api/whiteboards/${whiteboard.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ strokes: annotation.getStrokes() }),
      })
      setActiveBoardId(whiteboard.id)
      setNewBoardName('')
      addJoinToast(`Saved "${whiteboard.name}"`)
      loadSavedBoards()
    }
    setBoardSaving(false)
  }

  async function saveActiveBoard() {
    if (!activeBoardId) return
    setBoardSaving(true)
    const token = await getToken()
    const res = await fetch(apiUrl(`/api/whiteboards/${activeBoardId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ strokes: annotation.getStrokes() }),
    })
    setBoardSaving(false)
    if (res.ok) addJoinToast('Board saved')
  }

  async function loadBoard(id) {
    const token = await getToken()
    const res = await fetch(apiUrl(`/api/whiteboards/${id}`), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const { whiteboard } = await res.json()
    annotation.loadStrokes(whiteboard.strokes || [])
    setActiveBoardId(whiteboard.id)
    setBoardsOpen(false)
    // Sync guests to the loaded board: clear their canvas, then replay each
    // stroke using the same {type:'stroke', action:'commit', stroke} shape
    // addTextStamp/onPointerUp already send - no new wire message needed,
    // the existing generic handleRemoteDraw on the guest side already
    // handles it.
    hostRTC.broadcast('annotation', { type: 'clear' })
    ;(whiteboard.strokes || []).forEach((stroke) => {
      hostRTC.broadcast('annotation', { type: 'stroke', action: 'commit', stroke })
    })
    addJoinToast(`Loaded "${whiteboard.name}"`)
  }

  async function deleteBoard(id) {
    const token = await getToken()
    await fetch(apiUrl(`/api/whiteboards/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (activeBoardId === id) setActiveBoardId(null)
    loadSavedBoards()
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

  function openChat() { setChatOpen(true); setSideTab('chat'); setUnreadCount(0) }
  function closeChat() { setChatOpen(false) }
  function openParticipants() { setGuestListOpen(true); setSideTab('participants') }

  function admitKnockById(peerId) {
    signalingWrite({ type: 'knock-response', action: 'approve', peerId })
    setKnockQueue((q) => q.filter((k) => k.peerId !== peerId))
    setWaitingChatByPeer((m) => { const n = { ...m }; delete n[peerId]; return n })
    setExpandedKnockPeerId((id) => (id === peerId ? null : id))
  }
  function rejectKnockById(peerId) {
    signalingWrite({ type: 'knock-response', action: 'reject', peerId })
    setKnockQueue((q) => q.filter((k) => k.peerId !== peerId))
    setWaitingChatByPeer((m) => { const n = { ...m }; delete n[peerId]; return n })
    setExpandedKnockPeerId((id) => (id === peerId ? null : id))
  }
  function admitAllKnocks() {
    knockQueue.forEach((k) => signalingWrite({ type: 'knock-response', action: 'approve', peerId: k.peerId }))
    setKnockQueue([])
    setWaitingChatByPeer({})
    setExpandedKnockPeerId(null)
  }

  function sendWaitingChatToGuest(peerId) {
    const text = waitingChatInput.trim()
    if (!text || !peerId) return
    signalingWrite({ type: 'waiting-chat', targetPeerId: peerId, text })
    setWaitingChatByPeer((m) => ({
      ...m,
      [peerId]: [...(m[peerId] || []), { from: 'me', text, t: Date.now() }],
    }))
    setWaitingChatInput('')
  }

  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). Sent straight over
  // the signaling WebSocket, not a WebRTC data channel - there are no
  // PeerConnections at all yet pre-start, so this is the only transport
  // available. Mirrors sendWaitingChatToGuest's pattern (add locally on
  // send, since the server never echoes a message back to its own sender).
  function sendLobbyChat() {
    const text = lobbyChatInput.trim()
    if (!text) return
    signalingWrite({ type: 'lobby-chat', text })
    setLobbyMessages((m) => [...m, { from: 'me', text, t: Date.now() }])
    setLobbyChatInput('')
  }

  function handleStartCall() {
    signalingWrite({ type: 'start-call' })
  }

  async function updateCap(newCap) {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(apiUrl(`/session/${sessionId}/cap?token=${encodeURIComponent(token)}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxGuests: newCap }),
    })
    if (res.ok) { setMaxGuests(newCap); setCapMenuOpen(false) }
  }

  async function downloadAudit() {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(apiUrl(`/session/${sessionId}/audit?token=${encodeURIComponent(token)}`))
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
      URL.revokeObjectURL(url)
      // .catch() here matters: handleEnd() may have already closed this
      // same AudioContext if the session was ended while still recording
      // (see handleEnd - it now leaves the close to this handler instead of
      // racing it, but this guard stays as a safety net either way).
      audioCtxRef.current?.close?.().catch(() => {})
      // Phase E: cloud upload for Business plan
      if (userPlan === 'business') {
        try {
          const token = await getToken()
          const form = new FormData()
          form.append('file', blob, 'recording.webm')
          const res = await fetch(apiUrl(`/api/sessions/${sessionId}/recording`), {
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
    const wasRecording = recorderRef.current?.state === 'recording'
    if (wasRecording) {
      recorderRef.current.stop()
      // Deliberately NOT closing audioCtxRef here - recorder.onstop closes
      // it once the final chunk has actually been flushed. Closing it
      // synchronously right after .stop() (which is asynchronous) used to
      // risk clipping the last fraction of a second of recorded audio, and
      // guaranteed a double-close (unhandled promise rejection) once
      // onstop ran afterward and tried to close it again.
    } else {
      audioCtxRef.current?.close?.().catch(() => {})
    }
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
      // Guard against exactly the bug this comment is fixing: the Text
      // tool requires ONE MORE click (on the canvas, to place the cursor)
      // before an <input> exists to type into and get caught by the check
      // above. Until that click happens, focus is still on the toolbar
      // button - so without this guard, typing a letter like 'd', 'l', 's',
      // or 'm' right after selecting Text silently fires a DIFFERENT
      // shortcut (switch mode, snapshot, mute) instead of doing nothing
      // visibly wrong, which looked identical to "the text tool is broken"
      // from the outside. See docs archive / bug report: text tool appeared
      // to do nothing when typed into immediately after selecting it.
      if (whiteboard && annotationTool === 'text') return
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
  }, [controlToken, setMode, toggleMute, takeSnapshot, chatOpen, focusMode, whiteboard, annotationTool])

  async function toggleLock() {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || localStorage.getItem('cs_token')
    if (!token) return
    const res = await fetch(apiUrl(`/session/${sessionId}/lock?token=${encodeURIComponent(token)}`), {
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
  // Follow the focused/spotlighted guest rather than always guestIds[0], so
  // the number shown matches who's actually on screen - small refinement
  // to the connection-quality indicator (design idea ?3.4).
  const networkTargetId = (focusGuestId && guestIds.includes(focusGuestId)) ? focusGuestId : guestIds[0]
  const network = useNetworkQuality(networkTargetId ? () => hostRTC.getStats(networkTargetId) : null, 'host')
  // Active-speaker indicator (found gap, now built - see docs/floor-mode-plan.md's
  // "Other features" list). Highlights whoever's currently talking in the
  // guest tile grid below, independent of floor mode.
  const speakingPeerIds = useActiveSpeaker(guestStreams)
  const remaining = sessionDuration * 60 - elapsed
  const expiryWarning = remaining < 900 && sessionStartRef.current
  const sessionEnded = remaining <= 0 && sessionStartRef.current
  const guestPillAmber = maxGuests && guestIds.length >= maxGuests
  const guestPillLabel = maxGuests ? `Guests (${guestIds.length}/${maxGuests}${guestPillAmber ? ' \u2014 full' : ''})` : `Guests (${guestIds.length})`
  const wbCurrentMode = mode === 'laser' ? 'laser' : (annotationTool === 'eraser' ? 'eraser' : annotationTool === 'text' ? 'text' : annotationTool === 'arrow' ? 'arrow' : 'annotate')

  // Feeds the redesign SidePanel's Participants tab (see SidePanel.jsx) --
  // built fresh each render from the same state the old guest-list popover
  // used, just reshaped into the { id, name, hand, cohost, hasFloor } shape
  // that component expects.
  const sidePanelParticipants = guestOrder.map((gid, idx) => ({
    id: gid,
    name: guestNames[gid] || `Guest ${idx + 1}`,
    isMe: false,
    hand: !!raisedHands[gid],
    cohost: coHostPeerIds.has(gid),
    hasFloor: floorPeerId === gid,
  }))
  const sidePanelOpen = (chatOpen || guestListOpen) && !focusMode

  // Fix 8: grid sizing
  const tileCols = guestIds.length <= 2 ? 1 : guestIds.length <= 4 ? 2 : 3
  const tileW = guestIds.length <= 2 ? 176 : guestIds.length <= 4 ? 156 : 136
  const tileH = guestIds.length <= 2 ? 99 : guestIds.length <= 4 ? 88 : 77
  const totalPages = Math.ceil(guestIds.length / GUESTS_PER_PAGE)
  const pagedGuests = guestIds.slice(guestPage * GUESTS_PER_PAGE, (guestPage + 1) * GUESTS_PER_PAGE)

  useEffect(() => { setPeerConnected(guestIds.length > 0) }, [guestIds.length, setPeerConnected])

  const overflowItems = [
    { label: locked ? 'Unlock session' : 'Lock session', onClick: toggleLock, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> },
    { label: 'Copy link', onClick: () => { navigator.clipboard.writeText(guestJoinUrl(publicOrigin, joinCode || shortCode || '')).then(() => addJoinToast('Link copied')) }, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg> },
    { label: 'Invite & QR', onClick: () => setInviteOpen(true), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { label: 'Schedule', onClick: () => setScheduleOpen(true), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
    'divider',
    { label: 'Take snapshot', onClick: takeSnapshot, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> },
    { label: 'Download audit', onClick: downloadAudit, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg> },
    { label: 'Set guest cap', onClick: () => setCapMenuOpen((v) => !v), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
    'divider',
    { label: 'Help & guide', onClick: () => setHelpOpen(true), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg> },
  ]

  if (!localStream && mediaError) {
    return <MediaPermissionScreen title="Camera and microphone needed" body="Enable access so your guest can see and hear you." error={mediaError} onRetry={requestMedia} />
  }

  // Pre-launch lobby (docs/pre-launch-lobby-plan.md). A completely separate
  // screen from the live call - no camera, no footer/whiteboard/toolbar,
  // just presence + text chat, since nobody has WebRTC connections yet.
  // Early-returned before the main render, same pattern as the
  // MediaPermissionScreen check above.
  if (sessionStarted === false) {
    return (
      <div className="h-screen app-bg flex flex-col safe-area">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/70 glass">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.35)]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            </div>
            <span className="font-mono text-xs text-slate-300 tracking-widest">{sessionName || 'CollabStream'}</span>
          </div>
          <button onClick={() => setInviteOpen(true)} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono hover:bg-slate-800">
            Invite
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-lg">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-cyan-200 text-xs font-mono mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Lobby &middot; not started yet
              </div>
              <h1 className="text-2xl font-semibold text-slate-100 mb-2">Waiting to start</h1>
              <p className="text-slate-400 text-sm">Share the invite link. Guests can arrive and chat here before you start the call.</p>
            </div>

            {lobbyGuests.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs font-mono text-slate-400 mb-2">Waiting ({lobbyGuests.length})</div>
                <div className="flex flex-wrap gap-2">
                  {lobbyGuests.map((g) => (
                    <span key={g.peerId} className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono">{g.name}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 max-h-56 overflow-y-auto">
              {lobbyMessages.length === 0 ? (
                <p className="text-slate-600 text-xs font-mono">No messages yet - say hi while people arrive.</p>
              ) : lobbyMessages.map((m, i) => (
                <div key={i} className={`text-xs font-mono mb-1.5 last:mb-0 ${m.from === 'me' ? 'text-cyan-300 text-right' : 'text-slate-300'}`}>
                  <span className="text-slate-600">{m.from === 'me' ? 'You: ' : `${m.from}: `}</span>{m.text}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-6">
              <input
                value={lobbyChatInput}
                onChange={(e) => setLobbyChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendLobbyChat()}
                placeholder="Say hi while people arrive..."
                maxLength={500}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600"
              />
              <button onClick={sendLobbyChat} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-700">Send</button>
            </div>

            <button onClick={handleStartCall}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl text-sm font-mono font-semibold transition-all shadow-lg shadow-cyan-900/30">
              Start call{lobbyGuests.length > 0 ? ` (${lobbyGuests.length} waiting)` : ''}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        </main>

        <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} joinCode={joinCode} shortCode={shortCode}
          joinUrl={guestJoinUrl(publicOrigin, joinCode || shortCode || '')}
          lanUrl={lanOrigin ? guestJoinUrl(lanOrigin, joinCode || shortCode || '') : null}
          invalid={!joinValid && joinCode} title={sessionName} />
      </div>
    )
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
              <button onClick={() => (guestListOpen ? setGuestListOpen(false) : openParticipants())} className="relative px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 whitespace-nowrap">
                Guests ({guestOrder.length})
                {/* The "X raised hand" toast fades after 2.5s (addJoinToast) -
                    without a persistent indicator, a host who doesn't act on
                    it immediately (or who's mid-conversation and misses it)
                    has no way to know a hand is still raised without
                    proactively opening this panel. handQueue tracks raised
                    hands in the order they were raised; Object.keys(raisedHands)
                    would work equally well here but handQueue is already the
                    canonical ordered list broadcast to guests, so it's reused. */}
                {handQueue.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-zinc-900 text-[10px] font-mono font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                    ?
                  </span>
                )}
              </button>
            )}
            {/* Knocking guests used to force open a full-screen, centered
                modal the instant someone knocked - directly interrupting
                whatever the host was doing (mid-share, mid-conversation)
                with something that couldn't be glanced at and dismissed.
                This is the non-blocking replacement: a small badge the host
                clicks when they're ready, not a popup that clicks itself.
                See the panel JSX further down for Admit all / per-guest
                admit / snooze. */}
            {knockQueue.length > 0 && (
              <button onClick={() => setKnockPanelOpen((v) => !v)} className="relative px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 whitespace-nowrap">
                ?? Waiting
                <span className="absolute -top-1.5 -right-1.5 bg-cyan-500 text-zinc-900 text-[10px] font-mono font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
                  {knockQueue.length}
                </span>
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
          {floorPeerId && !focusMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
              <Baton holderName={guestNames[floorPeerId] || 'Guest'} isMe={false} holding="floor" onClick={handleRevokeFloor} />
            </div>
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
                onOpenBoards={userPlan === 'business' ? openBoardsPanel : undefined}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: 'none', zIndex: 10, cursor: annotationTool === 'text' ? 'text' : 'crosshair' }}
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
                label={!hasScreen && focusGuestId ? (guestNames[focusGuestId] || 'Guest') : null}
                annotationHandlers={{ onPointerDown: annotation.onPointerDown, onPointerMove: annotation.onPointerMove, onPointerUp: annotation.onPointerUp, onResize: annotation.redraw }} />
              <canvas ref={cursorCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }} />
            </div>
          ) : (
            // VideoTile has its own self-contained PiP button (own ref, own
            // <video> element) - a second PiP button used to be rendered
            // here on top of it, but it referenced HostRoom's own videoRef,
            // which is never attached to a DOM node in this branch (only
            // wired to ScreenView, not VideoTile). That dead button always
            // found videoRef.current === null and did nothing, while
            // sitting at zIndex:10 in nearly the same top-right corner as
            // VideoTile's working one - very likely intercepting clicks
            // meant for the button underneath. Removed; VideoTile's own
            // button is the only one now.
            <div className="w-full h-full relative">
              <VideoTile stream={localStream} name="You" muted={true} label="You" />
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
                  const isSpeaking = speakingPeerIds.has(gid)
                  return (
                    <div
                      key={gid}
                      onClick={() => setFocusGuestId(isFocused ? null : gid)}
                      style={{
                        width: tileW, height: tileH, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                        outline: isFocused ? '2px solid #22d3ee' : isSpeaking ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.07)',
                        boxShadow: isSpeaking && !isFocused ? '0 0 10px rgba(52,211,153,0.45)' : 'none',
                        transition: 'outline 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <VideoFeed stream={guestStreams[gid]} name={guestNames[gid] || `Guest ${guestPage * GUESTS_PER_PAGE + idx + 1}`} label={guestNames[gid] || `Guest ${guestPage * GUESTS_PER_PAGE + idx + 1}`} muted={false} corner="br" inline={true} draggable={false} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {guestIds.map((gid) => <RemoteAudio key={gid} stream={guestStreams[gid]} />)}
          <CaptionsOverlay captions={captions} interimText={captionsHook.interimText} enabled={captionsEnabled || captions.length > 0} />

          {reactions.map((r) => (
            <div key={r.id} className="reaction-float fixed pointer-events-none z-[9990] text-2xl" style={{ bottom: 80, left: `${r.x}%` }}>{r.emoji}</div>
          ))}

          {focusHint && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 border border-slate-700 text-slate-300 text-xs font-mono animate-fade-in">Press F to exit focus mode</div>
          )}
        </main>

        {sidePanelOpen && (
          <SidePanel
            messages={chat.messages}
            onSendChat={(text, target) => chat.send(text, target)}
            chatTargets={guestOrder.map((gid, i) => ({ id: gid, label: guestNames[gid] || `Guest ${i + 1}` }))}
            selectedChatTarget={chatTarget}
            onChatTargetChange={setChatTarget}
            unreadCount={unreadCount}
            onOpen={() => setUnreadCount(0)}
            participants={sidePanelParticipants}
            onGiveFloor={handleGrantFloor}
            onEndFloor={handleRevokeFloor}
            onMuteAll={handleMuteAll}
            onUnmuteAll={handleUnmuteAll}
            onOpenWhiteboard={toggleWhiteboard}
            myRole="host"
            defaultTab={sideTab}
            onClose={() => { setChatOpen(false); setGuestListOpen(false) }}
          />
        )}
      </div>

      {!focusMode && (
        <footer className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-800/70 glass z-20 safe-area">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
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
              <button onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts" className="flex-shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
              </button>
              <button onClick={() => setHelpOpen(true)} title="Help & guide" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 whitespace-nowrap">
                Help
              </button>
          </div>
          <div className="w-px h-8 bg-slate-800 flex-shrink-0 hidden sm:block" />
          <div className="flex-shrink-0">
            <ControlBar onGrant={handleGrant} onRevoke={handleRevoke} forceDisabled={!controlSupported || !flags.control}
              disabledReason={!flags.control ? 'Control is disabled' : !controlSupported ? 'Desktop only' : undefined}
              controlHolderName={guestNames[controlPeerId] || 'Guest'} />
          </div>
        </footer>
      )}


      {capMenuOpen && (
        <div className="absolute right-4 top-16 modal-enter bg-slate-950 border border-slate-800 rounded-xl p-3 z-50 shadow-xl">
          <div className="text-xs font-mono text-slate-400 mb-2">Set guest cap</div>
          <div className="flex flex-col gap-1">
            {[2, 3, 5, 10, 20].filter((n) => userPlan === 'business' || n <= (userPlan === 'pro' ? 10 : 3)).map((n) => (
              <button key={String(n)} onClick={() => updateCap(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono text-left ${maxGuests === n ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                {n} guests
                {guestOrder.length > n && <span className="ml-2 text-amber-400 text-[10px]">(below current)</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setCapMenuOpen(false)} className="mt-2 w-full text-xs font-mono text-slate-500 hover:text-slate-200">Cancel</button>
        </div>
      )}


      {boardsOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBoardsOpen(false)}>
          <div className="modal-enter bg-slate-950 border border-slate-800 rounded-2xl p-6 w-[90%] max-w-sm max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-100 text-sm font-mono">Saved boards</span>
              <button onClick={() => setBoardsOpen(false)} className="text-slate-500 text-xs font-mono">Close</button>
            </div>
            <div className="flex gap-2 mb-3">
              <input value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="New board name"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600" />
              <button onClick={() => saveBoardAs(newBoardName)} disabled={boardSaving || !newBoardName.trim()}
                className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-zinc-900 text-xs font-mono font-semibold whitespace-nowrap">
                Save as new
              </button>
            </div>
            {activeBoardId && (
              <button onClick={saveActiveBoard} disabled={boardSaving}
                className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800">
                Save changes to current board
              </button>
            )}
            {boardsLoading ? (
              <div className="text-slate-500 font-mono text-xs">Loading&hellip;</div>
            ) : savedBoards.length === 0 ? (
              <div className="text-slate-500 font-mono text-xs">No saved boards yet.</div>
            ) : (
              <div className="space-y-2">
                {savedBoards.map((b) => (
                  <div key={b.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${activeBoardId === b.id ? 'bg-cyan-500/10 border-cyan-700' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-slate-200 text-xs font-mono truncate">{b.name}</div>
                      <div className="text-slate-500 text-[10px] font-mono">{b.updated_at ? new Date(b.updated_at).toLocaleString() : ''}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => loadBoard(b.id)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-mono">Load</button>
                      <button onClick={() => deleteBoard(b.id)} className="px-2 py-1 rounded bg-red-950 border border-red-800 text-red-200 text-[10px] font-mono">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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

      {/* Knock panel: side panel, not a center-screen blocking modal (see
          the header badge comment above for the full "why"). Opens only on
          click, lists every waiting guest at once with per-guest Admit/
          Decline + an expandable per-guest chat thread (reusing the same
          waiting-room chat backend from docs/waiting-room-chat-plan.md,
          just restructured to show the whole queue instead of only the
          front of it), an "Admit all" bulk action for when the host trusts
          everyone waiting, and a snooze control so a host who's mid-
          conversation can mute the arrival toast for a few minutes without
          losing the queue itself - the badge count keeps updating either way. */}
      {knockPanelOpen && knockQueue.length > 0 && !focusMode && (
        <div className="absolute left-4 top-20 slide-in-left bg-zinc-950/95 border border-zinc-800 rounded-xl p-3 text-xs font-mono z-40 w-80 max-w-[85vw] max-h-[70vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="text-zinc-300 font-semibold">Waiting to join ({knockQueue.length})</div>
            <button onClick={() => setKnockPanelOpen(false)} className="text-zinc-500 hover:text-zinc-200 px-1">&#x2715;</button>
          </div>

          <div className="flex items-center gap-1.5 mb-3">
            <button onClick={admitAllKnocks} className="flex-1 px-2 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-mono">
              Admit all
            </button>
            <div className="relative">
              <button onClick={() => setSnoozeMenuOpen((v) => !v)} title="Snooze the arrival notification"
                className={`px-2.5 py-1.5 rounded border text-xs font-mono ${knockMutedUntil > Date.now() ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>
                &#128276;
              </button>
              {snoozeMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl z-50 min-w-[150px] py-1">
                  {knockMutedUntil > Date.now() && (
                    <button onClick={() => { setKnockMutedUntil(0); setSnoozeMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-amber-300 hover:bg-zinc-900 border-b border-zinc-800">
                      Unmute now
                    </button>
                  )}
                  {[5, 15, 30].map((mins) => (
                    <button key={mins} onClick={() => { setKnockMutedUntil(Date.now() + mins * 60000); setSnoozeMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-900">
                      Mute {mins}m
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {knockMutedUntil > Date.now() && (
            <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-900 text-amber-300 text-[11px]">
              Arrival notifications muted until {new Date(knockMutedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <div className="space-y-2">
            {knockQueue.map((knock) => (
              <div key={knock.peerId} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-200 truncate">{knock.name || 'Guest'}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => admitKnockById(knock.peerId)} className="px-2 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-200 text-[10px]">Admit</button>
                    <button onClick={() => rejectKnockById(knock.peerId)} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px]">Decline</button>
                    <button onClick={() => setExpandedKnockPeerId((id) => (id === knock.peerId ? null : knock.peerId))} title="Message this guest while they wait"
                      className={`px-1.5 py-1 rounded border text-[10px] ${expandedKnockPeerId === knock.peerId ? 'bg-cyan-950 border-cyan-700 text-cyan-200' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                      &#128172;
                    </button>
                  </div>
                </div>

                {expandedKnockPeerId === knock.peerId && (
                  <div className="mt-2 pt-2 border-t border-zinc-800">
                    <div className="max-h-28 overflow-y-auto space-y-1.5 mb-2">
                      {(waitingChatByPeer[knock.peerId] || []).length === 0 ? (
                        <p className="text-zinc-600 text-[11px]">No messages from this guest yet.</p>
                      ) : waitingChatByPeer[knock.peerId].map((m) => (
                        <div key={m.t + m.from} className={`text-[11px] ${m.from === 'me' ? 'text-cyan-300 text-right' : 'text-zinc-300'}`}>
                          <span className="text-zinc-600">{m.from === 'me' ? 'You: ' : `${knock.name || 'Guest'}: `}</span>{m.text}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        value={waitingChatInput}
                        onChange={(e) => setWaitingChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { sendWaitingChatToGuest(knock.peerId) } }}
                        placeholder="Reply while they wait..."
                        maxLength={500}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 font-mono outline-none focus:border-cyan-600"
                      />
                      <button onClick={() => sendWaitingChatToGuest(knock.peerId)} className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-900 text-[11px] font-mono font-semibold">Send</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingControlPeerId && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="modal-enter bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 className="text-zinc-100 text-sm font-mono mb-2">Guest requests control</h3>
            <p className="text-zinc-500 text-xs mb-4">Approve to give full control. Press Esc anytime to take back.</p>
            {/* Control has no in-browser mechanism at all - it only works
                through the separate companion desktop app injecting input
                into the OS (see useCompanion.js). Approving without it
                connected does nothing visible to either side, which used to
                look exactly like a broken feature rather than a missing
                prerequisite. */}
            {!companionConnected && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-200 text-[11px] font-mono leading-relaxed">
                &#9888; Companion app isn't connected. Approving now will grant control but nothing will actually happen until you open the companion app on this device.
              </div>
            )}
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
      <HelpGuide open={helpOpen} onClose={() => setHelpOpen(false)} role="host" />
      <OnboardingTips role="host" tips={['Share your screen to start.', 'Press ? for shortcuts, or Help for the full guide.', 'Press F for focus mode.']} />
      <CreatorSignature variant="console" projectName="CollabStream" />
    </div>
  )
}
