import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession, resolveJoinCode } from '../lib/session.js'
import CreatorSignature from '../components/CreatorSignature.jsx'
import { getAuthStatus, getUser, signOut } from '../lib/auth.js'

const JOIN_MODES = [
  { value: 'open', label: 'Open', desc: 'Anyone with the link joins instantly' },
  { value: 'approval', label: 'Approval', desc: 'You admit each guest individually' },
  { value: 'locked', label: 'Locked', desc: 'No new guests can join' },
]

const GUEST_CAP_OPTIONS = [
  { value: '2', label: '2 guests' },
  { value: '3', label: '3 guests' },
  { value: '5', label: '5 guests' },
  { value: '10', label: '10 guests' },
  { value: '20', label: '20 guests' },
]

const PLAN_LIMITS = {
  free: { maxGuests: 3, durationMinutes: 45 },
  pro: { maxGuests: 10, durationMinutes: 480 },
  business: { maxGuests: 20, durationMinutes: 480 },
}

function SessionSettingsModal({ open, onClose, onStart, loading, plan = 'free' }) {
  const [sessionName, setSessionName] = useState(() => localStorage.getItem('cs_session_name') || '')
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free
  const [maxGuests, setMaxGuests] = useState(String(limits.maxGuests))
  const [joinMode, setJoinMode] = useState('open')
  const [durationHours, setDurationHours] = useState(plan === 'free' ? 0 : 2)
  const [durationMins, setDurationMins] = useState(plan === 'free' ? 45 : 0)
  const [customCap, setCustomCap] = useState('')
  const [showCustomCap, setShowCustomCap] = useState(false)
  const totalMinutes = durationHours * 60 + durationMins
  const capOptions = GUEST_CAP_OPTIONS.filter((o) => Number(o.value) <= limits.maxGuests)
  const maxHours = Math.floor(limits.durationMinutes / 60)
  const hourOptions = Array.from({ length: maxHours + 1 }, (_, i) => i)
  const minuteOptions = plan === 'free' ? [15, 30, 45] : [0, 15, 30, 45]

  useEffect(() => {
    setMaxGuests(String(limits.maxGuests))
    setCustomCap('')
    setShowCustomCap(false)
    setDurationHours(plan === 'free' ? 0 : 2)
    setDurationMins(plan === 'free' ? 45 : 0)
  }, [plan, limits.maxGuests])

  function handleStart() {
    const requestedCap = showCustomCap ? Number(customCap) : Number(maxGuests)
    const requestedDuration = totalMinutes || limits.durationMinutes
    onStart({
      sessionName: sessionName.trim(),
      maxGuests: Math.min(requestedCap || limits.maxGuests, limits.maxGuests),
      joinMode,
      durationMinutes: Math.min(requestedDuration, limits.durationMinutes),
    })
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-zinc-950 p-6 shadow-2xl modal-enter">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-mono text-slate-100 font-semibold">Session settings</h2>
          <button onClick={onClose} className="text-xs font-mono text-slate-500 hover:text-slate-200">Cancel</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 font-mono mb-1.5 block">Session name</label>
            <input value={sessionName} maxLength={40} onChange={(e) => setSessionName(e.target.value)} placeholder="My session"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600" />
          </div>
          <div>
            <label className="text-xs text-slate-400 font-mono mb-1.5 block">Max guests</label>
            <div className="flex items-center gap-2">
              <select value={showCustomCap ? 'custom' : maxGuests}
                onChange={(e) => { if (e.target.value === 'custom') setShowCustomCap(true); else { setShowCustomCap(false); setMaxGuests(e.target.value) } }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none">
                {capOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value="custom">Custom…</option>
              </select>
              {showCustomCap && (
                <input type="number" min={1} max={limits.maxGuests} value={customCap} onChange={(e) => setCustomCap(e.target.value)} placeholder="N"
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none" />
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-mono mb-1.5 block">Join mode</label>
            <div className="flex gap-2">
              {JOIN_MODES.map((m) => (
                <button key={m.value} onClick={() => setJoinMode(m.value)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left ${joinMode === m.value ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                  <div className="font-semibold mb-0.5">{m.label}</div>
                  <div className="text-[10px] opacity-70 leading-tight">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-mono mb-1.5 block">Duration</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-mono">Hours</span>
                <select value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono outline-none">
                  {hourOptions.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-mono">Minutes</span>
                <select value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono outline-none">
                  {minuteOptions.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </div>
              <span className="text-xs text-slate-500 font-mono">{totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ` : ''}{totalMinutes % 60}m</span>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <button onClick={handleStart} disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-900 rounded-xl text-sm font-mono font-semibold transition-all">
            {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating session&hellip;</> : <>Start session <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AppLanding() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [guestName, setGuestName] = useState(() => localStorage.getItem('cs_name') || '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userEmail, setUserEmail] = useState(null)
  const [userPlan, setUserPlan] = useState('free')
  const navigate = useNavigate()

  useEffect(() => {
    getUser().then(async (u) => {
      if (!u) { navigate('/auth'); return }
      setUserEmail(u.email)
      const status = await getAuthStatus()
      setUserPlan(status.plan || 'free')
    })
  }, [navigate])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.pathname.startsWith('/join/')) {
      const code = url.pathname.split('/').pop()
      if (code) { setJoinCode(code); setTimeout(() => handleJoinByCode(code), 0) }
    }
  }, [])

  async function handleStart(settings) {
    setLoading(true); setError(null)
    try {
      const { sessionId, token, joinCode: jc, shortCode: sc } = await createSession(settings)
      if (settings.sessionName) localStorage.setItem('cs_session_name', settings.sessionName)
      if (token) localStorage.setItem('cs_token', token)
      if (jc) localStorage.setItem('cs_join_code', jc)
      if (sc) localStorage.setItem('cs_short_code', sc)
      navigate(`/room/${sessionId}/host?token=${encodeURIComponent(token)}`)
    } catch (err) {
      setError(err.message || 'Could not create session.')
      setLoading(false)
    }
  }

  async function handleJoinByCode(codeOverride) {
    let raw = codeOverride
    if (raw && raw.target) raw = null
    const code = String(raw ?? joinCode ?? '').trim()
    if (!code) return
    if (!guestName.trim()) { setError('Please enter a name or nickname.'); return }
    setError(null)
    try {
      const data = await resolveJoinCode(code)
      if (!data) { setError('Invalid code.'); return }
      localStorage.setItem('cs_name', guestName.trim())
      navigate(`/room/${data.sessionId}?token=${encodeURIComponent(data.token)}`)
    } catch { setError('Could not resolve code.') }
  }

  return (
    <div className="min-h-screen app-bg flex flex-col safe-area">
      <SessionSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onStart={handleStart} loading={loading} plan={userPlan} />

      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)', top: -100, left: -150 }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)', top: 200, right: -100 }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.05) 0%, transparent 70%)', bottom: -50, left: '40%' }} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center shadow-[0_0_18px_rgba(34,211,238,0.4)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
          </div>
          <span className="font-mono text-sm font-medium text-slate-200 tracking-widest">CollabStream</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-xs font-mono text-slate-400 hover:text-slate-200">Dashboard</button>
          <button onClick={() => navigate('/settings')} className="text-xs font-mono text-slate-400 hover:text-slate-200">Settings</button>
          {userEmail && <span className="text-xs font-mono text-slate-500 hidden sm:block">{userEmail}</span>}
          <button onClick={async () => { await signOut(); navigate('/') }} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono hover:bg-slate-800">Sign out</button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-xl mx-auto">
          <div className="anim-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-cyan-200 text-xs font-mono mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            No installs &middot; Just share the link
          </div>
          <h1 className="anim-1 text-4xl sm:text-5xl font-semibold text-slate-100 leading-tight mb-4">
            Start a new session
          </h1>
          <p className="anim-2 text-slate-400 text-lg leading-relaxed mb-10 font-light">
            Share your screen, annotate, or hand over control to your guest in real time.
          </p>
          <div className="anim-3 flex flex-col items-center gap-3">
            <button onClick={() => setSettingsOpen(true)}
              className="group flex items-center gap-3 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl text-base font-mono font-medium transition-all shadow-lg shadow-cyan-900/30">
              Start Session
              <svg className="group-hover:translate-x-1 transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
            {error && <p className="text-red-300 text-sm font-mono">{error}</p>}
          </div>
          <div className="anim-3 mt-6 w-full max-w-sm mx-auto space-y-2">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name or nickname"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500" />
            <div className="flex items-center gap-2">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                placeholder="Enter join code" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500" />
              <button onClick={handleJoinByCode} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800">Join</button>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-8 py-5 border-t border-slate-800/70 flex items-center justify-center">
        <span className="text-slate-500 text-xs font-mono">No recording &middot; Sessions are ephemeral</span>
      </footer>
      <CreatorSignature />
    </div>
  )
}
