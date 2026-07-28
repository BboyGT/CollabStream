import { useState, useRef, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'cs_chat_dock'
const POS_KEY = 'cs_chat_pos'
const MIN_H = 36

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

function loadDock() {
  try { return localStorage.getItem(STORAGE_KEY) || 'floating' } catch { return 'floating' }
}
function saveDock(v) {
  try { localStorage.setItem(STORAGE_KEY, v) } catch {}
}
function loadPos() {
  try { return JSON.parse(localStorage.getItem(POS_KEY)) || { x: window.innerWidth - 296, y: 72 } }
  catch { return { x: window.innerWidth - 296, y: 72 } }
}
function savePos(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconFloat = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1" y="1" width="12" height="12" rx="1.5" />
    <path d="M5 1v12M1 5h4" />
  </svg>
)
const IconDock = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="1" y="1" width="12" height="12" rx="1.5" />
    <line x1="9" y1="1" x2="9" y2="13" />
  </svg>
)
const IconMinus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="3" y1="7" x2="11" y2="7" />
  </svg>
)
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="3" y1="3" x2="11" y2="11" />
    <line x1="11" y1="3" x2="3" y2="11" />
  </svg>
)
const IconBubble = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8.5a1.5 1.5 0 0 1-1.5 1.5H4L1.5 12.5V2.5A1.5 1.5 0 0 1 3 1h7.5A1.5 1.5 0 0 1 12 2.5v6z" />
  </svg>
)

// ── Message bubbles ─────────────────────────────────────────────────────────
function MessageGroup({ messages, isOwn, unreadIndex, groupIndex }) {
  const showUnread = unreadIndex !== null && groupIndex === unreadIndex
  return (
    <>
      {showUnread && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(34,211,238,0.2)' }} />
          <span style={{ fontSize: 10, color: 'rgba(100,116,139,1)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>New messages</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(34,211,238,0.2)' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1
          const isFirst = i === 0
          const isPrivate = msg.target && msg.target !== 'all'
          return (
            <div key={msg._id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
              {isFirst && !isOwn && msg.from && (
                <span style={{ fontSize: 10, color: 'rgba(100,116,139,1)', fontFamily: 'monospace', marginBottom: 2, paddingLeft: 6 }}>
                  {msg.from}
                </span>
              )}
              {isPrivate && (
                <span style={{ fontSize: 9, color: 'rgba(245,158,11,0.75)', fontFamily: 'monospace', marginBottom: 2, paddingLeft: isOwn ? 0 : 6, paddingRight: isOwn ? 6 : 0 }}>
                  → private
                </span>
              )}
              {msg.type === 'file' ? (
                <div style={{
                  background: isOwn ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
                  border: isOwn ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '8px 12px',
                  maxWidth: 210,
                }}>
                  <a href={msg.url} download={msg.name}
                    style={{ color: '#22d3ee', fontSize: 11, fontFamily: 'monospace', textDecoration: 'underline', wordBreak: 'break-all' }}>
                    {msg.name}
                  </a>
                  {msg.size && <div style={{ fontSize: 10, color: 'rgba(100,116,139,1)', marginTop: 2, fontFamily: 'monospace' }}>{formatSize(msg.size)}</div>}
                </div>
              ) : (
                <div style={{
                  background: isOwn ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
                  border: isOwn ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '7px 12px',
                  maxWidth: 210,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: isOwn ? '#e0f7fa' : '#e2e8f0',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}>
                  {msg.text}
                </div>
              )}
              {isLast && (
                <span style={{ fontSize: 10, color: 'rgba(100,116,139,0.8)', fontFamily: 'monospace', marginTop: 2, paddingRight: isOwn ? 4 : 0, paddingLeft: isOwn ? 0 : 4 }}>
                  {msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function groupMessages(messages) {
  const groups = []
  let cur = null
  messages.forEach((msg, idx) => {
    const sender = msg.from || (msg.type === 'file' ? msg.from : 'unknown')
    const senderRole = msg.fromRole || msg.from
    if (!cur || cur.from !== sender || cur.fromRole !== senderRole) {
      cur = { from: sender, fromRole: senderRole, messages: [], startIdx: idx }
      groups.push(cur)
    }
    cur.messages.push({ ...msg, _id: idx })
  })
  return groups
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ChatPanel({
  messages = [],
  onSend,
  onSendFile,
  onClose,
  targets = [],
  selectedTarget = 'all',
  onTargetChange,
  unreadCount = 0,
  onOpen,
  myRole = 'host',
  onDockChange,
  initialDock,
}) {
  const [dock, setDock] = useState(() => initialDock || loadDock())
  const [minimised, setMinimised] = useState(false)
  const [pos, setPosState] = useState(loadPos)
  const [text, setText] = useState('')
  const [seenCount, setSeenCount] = useState(messages.length)
  const fileRef = useRef(null)
  const bottomRef = useRef(null)
  const panelRef = useRef(null)
  const dragRef = useRef({ dragging: false, ox: 0, oy: 0 })
  const posRef = useRef(pos)

  // unread separator: messages[seenCount] is the first unread
  const unreadSepIdx = seenCount < messages.length ? seenCount : null

  useEffect(() => {
    if (!minimised) {
      setSeenCount(messages.length)
      onOpen?.()
    }
  }, [minimised, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, minimised])

  // ── Drag logic ────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e) => {
    if (dock === 'docked') return
    if (e.target.closest('button')) return
    e.preventDefault()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { dragging: true, ox: e.clientX - rect.left, oy: e.clientY - rect.top }
    document.body.style.userSelect = 'none'
    document.body.style.pointerEvents = 'none'
    panel.style.pointerEvents = 'all'
  }, [dock])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return
      const { ox, oy } = dragRef.current
      const W = window.innerWidth
      const H = window.innerHeight
      const pw = panelRef.current?.offsetWidth || 280
      const ph = panelRef.current?.offsetHeight || 400
      const x = clamp(e.clientX - ox, 8, W - pw - 8)
      const y = clamp(e.clientY - oy, 8, H - ph - 8)
      posRef.current = { x, y }
      if (panelRef.current) {
        panelRef.current.style.left = `${x}px`
        panelRef.current.style.top = `${y}px`
      }
    }
    function onUp() {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      document.body.style.userSelect = ''
      document.body.style.pointerEvents = ''
      setPosState({ ...posRef.current })
      savePos(posRef.current)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  function switchDock(next) {
    setDock(next)
    saveDock(next)
    setMinimised(false)
    onDockChange?.(next)
  }

  function handleSend() {
    const t = text.trim()
    if (!t) return
    onSend?.(t, selectedTarget)
    setText('')
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    onSendFile?.(file, selectedTarget)
    e.target.value = ''
  }

  const groups = groupMessages(messages)

  // Find which group contains the unread separator
  let unreadGroupIdx = null
  if (unreadSepIdx !== null) {
    let runningIdx = 0
    for (let gi = 0; gi < groups.length; gi++) {
      if (runningIdx === unreadSepIdx) { unreadGroupIdx = gi; break }
      if (runningIdx + groups[gi].messages.length > unreadSepIdx) { unreadGroupIdx = gi; break }
      runningIdx += groups[gi].messages.length
    }
  }

  // ── Minimised title bar ────────────────────────────────────────────────────
  const newMsgs = messages.length - seenCount
  const sharedHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 10px',
    height: 36,
    borderBottom: minimised ? 'none' : '1px solid rgba(51,65,85,0.7)',
    cursor: dock === 'floating' ? 'grab' : 'default',
    flexShrink: 0,
    userSelect: 'none',
  }

  const iconBtnStyle = {
    background: 'none',
    border: 'none',
    color: 'rgba(148,163,184,0.8)',
    cursor: 'pointer',
    padding: 3,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  const header = (
    <div
      style={sharedHeaderStyle}
      onMouseDown={onHeaderMouseDown}
      onClick={(e) => { if (minimised && !e.target.closest('button')) setMinimised(false) }}
    >
      <span style={{ color: 'rgba(148,163,184,0.7)', display: 'flex', alignItems: 'center' }}><IconBubble /></span>
      <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#e2e8f0' }}>Chat</span>
      {minimised && newMsgs > 0 && (
        <span style={{
          background: '#ef4444', color: '#fff', fontSize: 10, fontFamily: 'monospace',
          borderRadius: 99, padding: '0 5px', minWidth: 18, textAlign: 'center', lineHeight: '18px',
        }}>
          {newMsgs > 9 ? '9+' : newMsgs}
        </span>
      )}
      {targets.length > 0 && onTargetChange && !minimised && (
        <select
          value={selectedTarget}
          onChange={(e) => onTargetChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 4, padding: '2px 4px', fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace', outline: 'none' }}
        >
          <option value="all">Everyone</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {dock === 'floating'
          ? <button style={iconBtnStyle} title="Dock to side" onClick={(e) => { e.stopPropagation(); switchDock('docked') }}><IconDock /></button>
          : <button style={iconBtnStyle} title="Float panel" onClick={(e) => { e.stopPropagation(); switchDock('floating') }}><IconFloat /></button>
        }
        <button style={iconBtnStyle} title={minimised ? 'Expand' : 'Minimise'} onClick={(e) => { e.stopPropagation(); setMinimised((v) => !v) }}><IconMinus /></button>
        <button style={iconBtnStyle} title="Close chat" onClick={(e) => { e.stopPropagation(); onClose?.() }}><IconClose /></button>
      </div>
    </div>
  )

  // ── Shared panel style props ───────────────────────────────────────────────
  const panelBase = {
    background: 'rgba(2,6,15,0.96)',
    border: '1px solid rgba(51,65,85,0.7)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  }

  // ── DOCKED layout ─────────────────────────────────────────────────────────
  if (dock === 'docked') {
    return (
      <div style={{ ...panelBase, width: 280, flexShrink: 0, height: '100%', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderRight: 'none' }}>
        {header}
        {!minimised && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {groups.length === 0 && <p style={{ fontSize: 11, color: 'rgba(100,116,139,1)', fontFamily: 'monospace', textAlign: 'center', paddingTop: 24 }}>No messages yet</p>}
              {groups.map((g, gi) => (
                <MessageGroup key={gi} messages={g.messages} isOwn={g.fromRole === myRole} unreadIndex={unreadGroupIdx} groupIndex={gi} />
              ))}
              <div ref={bottomRef} />
            </div>
            <InputBar text={text} setText={setText} onSend={handleSend} onFile={handleFile} fileRef={fileRef} />
          </>
        )}
      </div>
    )
  }

  // ── FLOATING layout ───────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      style={{
        ...panelBase,
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 280,
        height: minimised ? MIN_H : 420,
        zIndex: 9000,
        transition: 'height 0.15s ease',
      }}
    >
      {header}
      {!minimised && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {groups.length === 0 && <p style={{ fontSize: 11, color: 'rgba(100,116,139,1)', fontFamily: 'monospace', textAlign: 'center', paddingTop: 24 }}>No messages yet</p>}
            {groups.map((g, gi) => (
              <MessageGroup key={gi} messages={g.messages} isOwn={g.fromRole === myRole} unreadIndex={unreadGroupIdx} groupIndex={gi} />
            ))}
            <div ref={bottomRef} />
          </div>
          <InputBar text={text} setText={setText} onSend={handleSend} onFile={handleFile} fileRef={fileRef} />
        </>
      )}
    </div>
  )
}

function InputBar({ text, setText, onSend, onFile, fileRef }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderTop: '1px solid rgba(51,65,85,0.5)' }}>
      <button
        onClick={() => fileRef.current?.click()}
        title="Send file"
        style={{ background: 'none', border: 'none', color: 'rgba(148,163,184,0.6)', cursor: 'pointer', padding: 4, fontSize: 14, display: 'flex', alignItems: 'center' }}
      >
        &#128206;
      </button>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
        placeholder="Type a message…"
        style={{
          flex: 1, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.7)',
          borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#e2e8f0',
          fontFamily: 'monospace', outline: 'none', minWidth: 0,
        }}
      />
      <button
        onClick={onSend}
        disabled={!text.trim()}
        style={{
          background: text.trim() ? '#0891b2' : 'rgba(51,65,85,0.4)',
          border: 'none', borderRadius: 8, padding: '6px 10px',
          color: text.trim() ? '#fff' : 'rgba(148,163,184,0.4)',
          fontSize: 11, fontFamily: 'monospace', cursor: text.trim() ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        Send
      </button>
    </div>
  )
}
