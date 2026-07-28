import { useEffect, useState } from 'react'
import { getAdminToken, setAdminToken, getAuthStatus } from '../lib/auth.js'
import { apiUrl } from '../lib/api.js'

export default function AdminDashboard() {
  const [token, setTokenState] = useState(() => getAdminToken())
  const [sessions, setSessions] = useState([])
  const [audit, setAudit] = useState({})
  const [error, setError] = useState(null)
  const [retention, setRetention] = useState(30)
  const [retentionInput, setRetentionInput] = useState('30')
  const [stats, setStats] = useState({ total: 0, active: 0, today: 0 })
  const [authStatus, setAuthStatus] = useState({ enabled: false, provider: 'none' })
  const [locked, setLocked] = useState(true)

  useEffect(() => {
    setAdminToken(token)
  }, [token])

  async function loadSessions() {
    setError(null)
    try {
      const res = await fetch(apiUrl(`/admin/sessions?limit=100`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('forbidden')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {
      setError('Invalid admin token or server not reachable.')
    }
  }

  async function loadRetention() {
    try {
      const res = await fetch(apiUrl(`/admin/retention`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setRetention(data.days || 30)
      setRetentionInput(String(data.days || 30))
    } catch {}
  }

  async function updateRetention() {
    const days = Number(retentionInput)
    if (!Number.isFinite(days) || days < 1) return
    const res = await fetch(apiUrl(`/admin/retention`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days }),
    })
    if (res.ok) {
      const data = await res.json()
      setRetention(data.days)
    }
  }

  async function loadAudit(sessionId) {
    const res = await fetch(apiUrl(`/admin/sessions/${sessionId}/audit`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    setAudit((a) => ({ ...a, [sessionId]: data.events || [] }))
  }

  async function endSession(sessionId) {
    await fetch(apiUrl(`/admin/sessions/${sessionId}/end`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    loadSessions()
  }

  async function loadStats() {
    const res = await fetch(apiUrl(`/admin/stats`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    setStats(data)
  }

  useEffect(() => {
    getAuthStatus().then(setAuthStatus)
  }, [])

  function handleUnlock() {
    setError(null)
    setLocked(false)
    loadSessions()
    loadRetention()
    loadStats()
  }

  return (
    <div className="min-h-screen app-bg p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-slate-100 text-xl font-mono">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <input
              value={token}
              onChange={(e) => setTokenState(e.target.value)}
              placeholder="Admin token"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
            />
            <button onClick={handleUnlock} className="px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400 text-cyan-200 text-xs font-mono">Unlock</button>
          </div>
        </div>

        <div className="mb-4 text-xs text-slate-500">
          Auth: {authStatus.enabled ? `Enabled (${authStatus.provider})` : 'Disabled (token only)'}
        </div>

        {locked && (
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-300 text-xs font-mono mb-6">
            Enter the admin token and click Unlock to view sessions.
          </div>
        )}

        {!locked && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-500">Total Sessions</div>
              <div className="text-lg text-slate-100 font-mono">{stats.total}</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-500">Active Now</div>
              <div className="text-lg text-slate-100 font-mono">{stats.active}</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-500">Created Today</div>
              <div className="text-lg text-slate-100 font-mono">{stats.today}</div>
            </div>
          </div>
        )}

        {!locked && (
          <div className="mb-6 p-4 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="text-slate-300 text-sm font-mono mb-2">Retention Policy</div>
          <div className="flex items-center gap-2">
            <input
              value={retentionInput}
              onChange={(e) => setRetentionInput(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 w-24"
            />
            <button onClick={updateRetention} className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono">Set Days</button>
            <span className="text-xs text-slate-500">Current: {retention} days</span>
          </div>
          </div>
        )}

        {error && <div className="text-red-300 text-sm font-mono mb-4">{error}</div>}

        {!locked && (
          <div className="space-y-4">
          {sessions.map((s) => (
            <div key={s.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
              <div className="flex items-center justify-between">
                <div className="text-slate-200 font-mono text-xs">{s.id}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => loadAudit(s.id)} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono">Audit</button>
                  <button onClick={() => endSession(s.id)} className="px-2 py-1 rounded bg-red-950 border border-red-800 text-red-200 text-xs font-mono">End</button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Created: {new Date(s.created_at).toLocaleString()} {s.ended_at ? `· Ended: ${new Date(s.ended_at).toLocaleString()}` : ''}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Join: {s.join_code} · Short: {s.short_code}
              </div>
              {audit[s.id] && (
                <div className="mt-3 text-xs text-slate-300 space-y-1">
                  {audit[s.id].map((e, i) => (
                    <div key={i}>{new Date(e.ts).toLocaleTimeString()} · {e.event}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  )
}
