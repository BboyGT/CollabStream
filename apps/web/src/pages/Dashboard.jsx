import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, getUser } from '../lib/auth.js'

function formatDuration(minutes) {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <div className="text-2xl font-mono font-bold text-slate-100 mb-1">{value ?? '—'}</div>
      <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">{label}</div>
      {sub && <div className="text-[10px] font-mono text-slate-600 mt-1">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState('free')
  const [stats, setStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) { navigate('/auth'); return }

      const [statusRes, dashRes] = await Promise.all([
        fetch('/auth/status', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/dashboard?page=${p}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (!statusRes.ok) { navigate('/auth'); return }
      const statusData = await statusRes.json()
      setPlan(statusData.plan || 'free')

      if (dashRes.ok) {
        const data = await dashRes.json()
        setStats(data.stats)
        setSessions(data.sessions || [])
        setTotalPages(data.totalPages || 1)
        setPage(data.page || 0)
      }
    } catch (err) {
      setError('Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { fetchData(0) }, [fetchData])

  async function downloadAudit(sessionId) {
    const token = await getToken()
    const res = await fetch(`/api/sessions/${sessionId}/audit`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data.events || [], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `collabstream-audit-${sessionId}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  async function openRecording(sessionId) {
    const token = await getToken()
    const res = await fetch(`/api/sessions/${sessionId}/recording`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const { url } = await res.json()
    window.open(url, '_blank')
  }

  const isFree = plan === 'free'

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800/70 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app')} className="flex items-center gap-2.5 text-slate-300 hover:text-slate-100 transition-colors">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="font-mono text-sm font-medium tracking-widest">CollabStream</span>
          </button>
          <span className="text-slate-700">/</span>
          <span className="font-mono text-sm text-slate-400">Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold uppercase tracking-widest ${plan === 'business' ? 'bg-amber-950/60 border border-amber-800 text-amber-200' : plan === 'pro' ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-200' : 'bg-slate-900 border border-slate-700 text-slate-400'}`}>
            {plan}
          </span>
          <button onClick={() => navigate('/settings')} className="text-xs font-mono text-slate-400 hover:text-slate-200">Settings</button>
          <button onClick={() => navigate('/app')} className="text-xs font-mono text-slate-400 hover:text-slate-200">New session</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Free plan upgrade banner */}
        {isFree && (
          <div className="mb-8 px-5 py-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/50 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-cyan-200 font-mono text-sm font-semibold mb-0.5">Session history is a Pro feature</div>
              <div className="text-cyan-300/70 text-xs font-mono">Upgrade to keep a permanent record of all your sessions.</div>
            </div>
            <button
              onClick={() => navigate('/settings?upgrade=pro')}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-900 rounded-xl text-xs font-mono font-semibold whitespace-nowrap transition-all"
            >
              Upgrade to Pro — $5/mo
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
            <StatCard label="Total sessions" value={stats.totalSessions} />
            <StatCard label="Total guests" value={stats.totalGuests} />
            <StatCard label="Hours hosted" value={stats.totalMinutes ? `${Math.round(stats.totalMinutes / 60 * 10) / 10}h` : '0h'} />
            <StatCard label="Recordings" value={stats.recordingsSaved} sub="saved to cloud" />
          </div>
        )}

        {/* Session list */}
        <div className={`rounded-2xl border border-slate-800 overflow-hidden ${isFree ? 'relative' : ''}`}>
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <span className="font-mono text-sm text-slate-300 font-semibold">Recent sessions</span>
            <span className="text-xs font-mono text-slate-500">{sessions.length} shown</span>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-slate-500 font-mono text-sm">Loading&hellip;</div>
          ) : error ? (
            <div className="px-5 py-12 text-center text-red-400 font-mono text-sm">{error}</div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-500 font-mono text-sm">No sessions yet. Start your first session to see history here.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800/60 text-slate-500 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-5 py-3 font-normal">Date</th>
                    <th className="text-left px-5 py-3 font-normal">Name</th>
                    <th className="text-right px-5 py-3 font-normal">Duration</th>
                    <th className="text-right px-5 py-3 font-normal">Peak guests</th>
                    <th className="text-center px-5 py-3 font-normal">Recording</th>
                    <th className="text-center px-5 py-3 font-normal">Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={s.id} className={`border-b border-slate-800/40 hover:bg-slate-900/40 transition-colors ${isFree && i >= 3 ? 'opacity-30 pointer-events-none select-none blur-sm' : ''}`}>
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{formatDate(s.started_at)}</td>
                      <td className="px-5 py-3 text-slate-200 max-w-[180px] truncate">{s.session_name || <span className="text-slate-600">Unnamed</span>}</td>
                      <td className="px-5 py-3 text-slate-300 text-right whitespace-nowrap">
                        {s.ended_at && s.started_at
                          ? formatDuration(Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000))
                          : <span className="text-emerald-400">Live</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-300 text-right">{s.peak_guests ?? '—'}</td>
                      <td className="px-5 py-3 text-center">
                        {s.recording_url
                          ? <button onClick={() => openRecording(s.id)} className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2">Download</button>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => downloadAudit(s.id)} className="text-slate-400 hover:text-slate-200 underline underline-offset-2">
                          JSON
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Free plan blur overlay */}
          {isFree && sessions.length > 3 && (
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
          )}
        </div>

        {/* Pagination */}
        {!isFree && totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => fetchData(page - 1)}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs font-mono text-slate-500">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => fetchData(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
