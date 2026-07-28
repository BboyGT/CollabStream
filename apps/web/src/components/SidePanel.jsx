import { useState, useEffect } from 'react'
import { BatonActionButton } from './Baton.jsx'

// Desktop call-screen side panel (collabstream-redesign.html prototype) —
// replaces two previously separate, differently-styled UI patterns: a
// floating/docked ChatPanel popup, and a completely separate "Guests"
// popover. Both now live as tabs in one consistent panel.
//
// Deliberate divergence from the prototype: its Whiteboard tab renders an
// actual ~270px sketch surface INSIDE this panel. Real collaborative
// diagramming needs more room than that to be usable, so the whiteboard
// itself stays a full-screen mode (unchanged from how it already worked) —
// this tab is just a consistent-looking entry point into it, not a shrunk
// embed. Chat and Participants match the prototype's structure closely.
const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'whiteboard', label: 'Whiteboard' },
  { id: 'participants', label: 'People' },
]

export default function SidePanel({
  messages = [],
  onSendChat,
  chatTargets = [],
  selectedChatTarget = 'all',
  onChatTargetChange,
  unreadCount = 0,
  onOpen,
  participants = [], // [{ id, name, isMe, hand, cohost, hasFloor }]
  onGiveFloor,
  onEndFloor,
  onMuteAll,
  onUnmuteAll,
  onCoHostAction, // guest-side: (action, targetPeerId) => void
  isCoHost = false,
  onOpenWhiteboard,
  myRole = 'host', // 'host' | 'guest'
  defaultTab = 'chat',
  onClose,
}) {
  const [tab, setTab] = useState(defaultTab)
  const [chatInput, setChatInput] = useState('')
  // Re-syncs if the parent asks for a different default tab after mount
  // (e.g. clicking "People" while the panel is already open on "Chat") —
  // the useState initializer above only runs once, so without this the
  // panel would stay stuck on whichever tab it first opened to.
  useEffect(() => { setTab(defaultTab) }, [defaultTab])

  function handleTabClick(id) {
    setTab(id)
    if (id === 'chat') onOpen?.()
  }

  function sendChat() {
    const text = chatInput.trim()
    if (!text) return
    onSendChat?.(text, selectedChatTarget)
    setChatInput('')
  }

  return (
    <div className="w-full md:w-[300px] flex-shrink-0 border-l border-line bg-ink-800 flex flex-col h-full">
      <div className="flex items-center border-b border-line flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            className={`flex-1 text-center py-3 text-xs font-semibold border-b-2 transition-colors ${
              tab === t.id ? 'text-ink-hi border-amber' : 'text-ink-dim border-transparent hover:text-ink-lo'
            }`}
          >
            {t.label}
            {t.id === 'chat' && unreadCount > 0 && tab !== 'chat' && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-coral text-white text-[10px] align-middle">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        ))}
        {onClose && (
          <button onClick={onClose} className="px-2.5 text-ink-dim hover:text-ink-hi flex-shrink-0">&#x2715;</button>
        )}
      </div>

      {tab === 'chat' && (
        <>
          <div className="flex-1 p-3.5 flex flex-col gap-3 overflow-y-auto min-h-0">
            {messages.length === 0 ? (
              <p className="text-ink-dim text-xs font-mono">No messages yet.</p>
            ) : messages.map((m, i) => {
              const isMe = m.from === myRole || m.from === 'me' || m.isMe
              return (
                <div key={i} className={`max-w-[82%] ${isMe ? 'self-end' : ''}`}>
                  <div className="text-[10px] text-ink-dim font-mono mb-0.5">{isMe ? 'you' : (m.from || 'guest')}</div>
                  <div
                    className={`px-2.5 py-2 text-[13px] leading-snug ${
                      isMe ? 'bg-amber-dim text-[#f1d9a8] rounded-[10px_10px_3px_10px]' : 'bg-ink-650 text-ink-hi rounded-[10px_10px_10px_3px]'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 p-3 border-t border-line flex-shrink-0">
            {chatTargets.length > 0 && (
              <select
                value={selectedChatTarget}
                onChange={(e) => onChatTargetChange?.(e.target.value)}
                className="w-24 bg-ink-700 border border-line rounded-lg px-2 text-ink-hi text-xs outline-none"
              >
                <option value="all">Everyone</option>
                {chatTargets.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            )}
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
              placeholder="Message the room…"
              className="flex-1 bg-ink-700 border border-line rounded-lg px-3 py-2 text-ink-hi text-sm outline-none placeholder:text-ink-dim"
            />
            <button onClick={sendChat} className="w-9 h-9 rounded-lg bg-amber hover:brightness-110 flex items-center justify-center flex-shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a1300" strokeWidth="2.4"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
        </>
      )}

      {tab === 'whiteboard' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5C626E" strokeWidth="1.6"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
          <p className="text-ink-dim text-xs leading-relaxed">
            The whiteboard opens full-screen so there's actually room to draw — this tab is just the way in.
          </p>
          <button onClick={onOpenWhiteboard} className="px-4 py-2 rounded-lg bg-amber-dim text-amber text-xs font-mono font-semibold hover:bg-amber/20 transition-colors">
            Open whiteboard
          </button>
        </div>
      )}

      {tab === 'participants' && (
        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 min-h-0">
          {myRole === 'host' && participants.length > 0 && (onMuteAll || onUnmuteAll) && (
            <div className="flex gap-1.5 px-0.5 pb-1">
              {onMuteAll && (
                <button onClick={onMuteAll} className="flex-1 px-2 py-1.5 rounded bg-ink-700 border border-line text-ink-lo text-[10px] font-mono">
                  Mute all
                </button>
              )}
              {onUnmuteAll && (
                <button onClick={onUnmuteAll} className="flex-1 px-2 py-1.5 rounded bg-ink-700 border border-line text-ink-lo text-[10px] font-mono">
                  Unmute all
                </button>
              )}
            </div>
          )}
          {participants.length === 0 ? (
            <p className="text-ink-dim text-xs font-mono px-2">Nobody else here yet.</p>
          ) : participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-ink-700 border border-line-soft">
              <div className="w-[30px] h-[30px] rounded-full bg-ink-650 flex items-center justify-center text-[11px] font-mono text-ink-lo flex-shrink-0">
                {(p.name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 text-[12.5px] font-semibold text-ink-hi truncate">
                {p.name}{p.isMe ? ' (you)' : ''}
                {p.cohost && <span className="ml-1 text-violet-300" title="Co-host">⭐</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {p.hand && <span className="text-amber text-xs" title="Hand raised">✋</span>}
                {!p.isMe && myRole === 'host' && (
                  p.hasFloor
                    ? <BatonActionButton label="End floor" onClick={() => onEndFloor?.()} />
                    : <BatonActionButton label="Give floor" onClick={() => onGiveFloor?.(p.id)} />
                )}
                {!p.isMe && myRole === 'guest' && isCoHost && (
                  <>
                    <button onClick={() => onCoHostAction?.('mute', p.id)} className="px-1.5 py-0.5 rounded bg-ink-800 border border-line text-ink-dim text-[10px]">Mute</button>
                    <button onClick={() => onCoHostAction?.('kick', p.id)} className="px-1.5 py-0.5 rounded bg-coral-dim border border-coral/40 text-coral text-[10px]">Kick</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
