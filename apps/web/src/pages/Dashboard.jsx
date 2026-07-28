import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken } from '../lib/auth.js'
import { apiUrl } from '../lib/api.js'

const PLAN_META = {
  free: {
    label: 'Free',
    tone: 'bg-slate-900 border-slate-700 text-slate-400',
    guests: 3,
    duration: '45 min',
    storage: 'No history',
  },
  pro: {
    label: 'Pro',
    tone: 'bg-cyan-950/60 border-cyan-800 text-cyan-200',
    guests: 10,
    duration: '8 hours',
    storage: 'Session history',
  },
  business: {
    label: 'Business',
    tone: 'bg-amber-950/60 border-amber-800 text-amber-200',
    guests: 20,
    duration: '8 hours',
    storage: 'Cloud workflows',
  },
}

function formatDuration(minutes) {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function sessionDuration(session) {
  if (session.ended_at && session.started_at) {
    return Math.max(1, Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000))
  }
  return session.duration_minutes || 0
}

function StatCard({ label, value, sub, accent = 'text-slate-100' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/45 px-4 py-4">
      <div className={`text-2xl font-mono font-semibold ${accent}`}>{value ?? '-'}</div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

function ActionButton({ children, onClick, primary = false, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-mono font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? 'bg-cyan-500 text-zinc-950 hover:bg-cyan-400'
          : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function Capability({ label, active, note }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 py-3 last:border-b-0">
      <div>
        <div className="text-sm font-mono text-slate-200">{label}</div>
        {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
        active ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-500'
      }`}>
        {active ? 'On' : 'Locked'}
      </span>
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
    setError(null)
    try {
      const token = await getToken()
      if (!token) { navigate('/auth'); return }

      const [statusRes, dashRes] = await Promise.all([
        fetch(apiUrl('/auth/status'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl(`/api/dashboard?page=${p}`), { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (!statusRes.ok) { navigate('/auth'); return }
      const statusData = await statusRes.json()
      const nextPlan = statusData.plan || 'free'
      setPlan(nextPlan)

      if (dashRes.ok) {
        const data = await dashRes.json()
        setStats(data.stats)
        setSessions(data.sessions || [])
        setTotalPages(data.totalPages || 1)
        setPage(data.page || 0)
      } else if (dashRes.status === 403) {
        setStats(null)
        setSessions([])
        setTotalPages(1)
        setPage(0)
      } else {
        setError('Could not load dashboard data.')
      }
    } catch {
      setError('Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => { fetchData(0) }, [fetchData])

  async function downloadAudit(sessionId) {
    const token = await getToken()
    const res = await fetch(apiUrl(`/api/sessions/${sessionId}/audit`), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data.events || [], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `collabstream-audit-${sessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function openRecording(sessionId) {
    const token = await getToken()
    const res = await fetch(apiUrl(`/api/sessions/${sessionId}/recording`), { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const { url } = await res.json()
    window.open(url, '_blank')
  }

  const isFree = plan === 'free'
  const isBusiness = plan === 'business'
  const meta = PLAN_META[plan] || PLAN_META.free
  const activeSessions = sessions.filter((s) => s.status === 'active' || !s.ended_at).length
  const averageMinutes = stats?.totalSessions ? Math.round((stats.totalMinutes || 0) / stats.totalSessions) : 0
  const latestSession = sessions[0]

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200">
      <header className="border-b border-slate-800/70 px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/app')} className="flex items-center gap-2.5 text-slate-300 transition-colors hover:text-slate-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
              <span className="font-mono text-sm font-medium tracking-widest">CollabStream</span>
            </button>
            <span className="hidden text-slate-700 sm:block">/</span>
            <span className="hidden font-mono text-sm text-slate-400 sm:block">Dashboard</span>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-widest ${meta.tone}`}>
              {meta.label}
            </span>
            <ActionButton onClick={() => navigate('/settings')}>Settings</ActionButton>
            <ActionButton onClick={() => navigate('/app')} primary>New session</ActionButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.45fr_0.9fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/35 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">Workspace overview</div>
                <h1 className="text-2xl font-semibold text-slate-100">Session operations</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Track hosted sessions, plan limits, recordings, and audit exports from one place.
                </p>
              </div>
              <div className="flex gap-2">
                <ActionButton onClick={() => fetchData(page)}>Refresh</ActionButton>
                {!isBusiness && <ActionButton onClick={() => navigate('/settings?upgrade=business')}>Business</ActionButton>}
              </div>
            </div>

            {isFree ? (
              <div className="mt-6 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4">
                <div className="font-mono text-sm font-semibold text-cyan-100">History is locked on Free</div>
                <p className="mt-1 text-sm text-cyan-200/70">Upgrade to Pro to store session history, export audit logs, and review activity after calls end.</p>
                <div className="mt-4">
                  <ActionButton onClick={() => navigate('/settings?upgrade=pro')} primary>Upgrade to Pro</ActionButton>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Sessions" value={stats?.totalSessions || 0} sub={`${activeSessions} active on this page`} />
                <StatCard label="Guests" value={stats?.totalGuests || 0} sub="Peak total" />
                <StatCard label="Hosted time" value={formatDuration(stats?.totalMinutes || 0)} sub={`${formatDuration(averageMinutes)} average`} />
                <StatCard label="Recordings" value={stats?.recordingsSaved || 0} sub={isBusiness ? 'Cloud saved' : 'Business only'} accent={isBusiness ? 'text-amber-200' : 'text-slate-100'} />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/35 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Current plan</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-100">{meta.label}</div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${meta.tone}`}>{plan}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-y border-slate-800 py-3 text-center">
              <div>
                <div className="font-mono text-sm text-slate-100">{meta.guests}</div>
                <div className="text-[10px] text-slate-500">Guests</div>
              </div>
              <div>
                <div className="font-mono text-sm text-slate-100">{meta.duration}</div>
                <div className="text-[10px] text-slate-500">Duration</div>
              </div>
              <div>
                <div className="font-mono text-sm text-slate-100">{meta.storage}</div>
                <div className="text-[10px] text-slate-500">Storage</div>
              </div>
            </div>
            <Capability label="Session history" active={!isFree} note="Dashboard records and audit exports" />
            <Capability label="Cloud recording" active={isBusiness} note="Requires Business and R2" />
            <Capability label="Branding and webhooks" active={isBusiness} note="External integrations and client-facing polish" />
          </div>
        </section>

        {!isFree && latestSession && (
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/35 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Latest session</div>
                <div className="mt-1 font-mono text-sm text-slate-200">{latestSession.session_name || 'Unnamed session'}</div>
                <div className="mt-1 text-xs text-slate-500">{formatDate(latestSession.started_at)} - {formatDuration(sessionDuration(latestSession))} - {latestSession.peak_guests || 0} peak guests</div>
              </div>
              <div className="flex gap-2">
                <ActionButton onClick={() => downloadAudit(latestSession.id)}>Audit JSON</ActionButton>
                <ActionButton onClick={() => navigate('/app')} primary>Start another</ActionButton>
              </div>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-800">
          <div className="flex flex-col gap-2 border-b border-slate-800 bg-slate-900/45 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-mono text-sm font-semibold text-slate-200">Recent sessions</div>
              <div className="mt-1 text-xs text-slate-500">{isFree ? 'Upgrade required' : `${sessions.length} shown on this page`}</div>
            </div>
            {!isFree && totalPages > 1 && (
              <div className="text-xs font-mono text-slate-500">Page {page + 1} of {totalPages}</div>
            )}
          </div>

          {isFree ? (
            <div className="px-5 py-14 text-center">
              <div className="font-mono text-sm font-semibold text-cyan-200">Upgrade to unlock records</div>
              <div className="mx-auto mt-2 max-w-md text-sm text-slate-500">Free sessions are intentionally ephemeral. Pro and Business plans keep the history needed for follow-up and accountability.</div>
              <div className="mt-5">
                <ActionButton onClick={() => navigate('/settings?upgrade=pro')} primary>Upgrade to Pro</ActionButton>
              </div>
            </div>
          ) : loading ? (
            <div className="px-5 py-12 text-center font-mono text-sm text-slate-500">Loading...</div>
          ) : error ? (
            <div className="px-5 py-12 text-center font-mono text-sm text-red-400">{error}</div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="font-mono text-sm font-semibold text-slate-300">No sessions yet</div>
              <div className="mt-2 text-sm text-slate-500">Start a session and it will appear here once the server records it.</div>
              <div className="mt-5">
                <ActionButton onClick={() => navigate('/app')} primary>Start session</ActionButton>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/35 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="px-5 py-3 text-left font-mono font-normal">Session</th>
                    <th className="px-5 py-3 text-left font-mono font-normal">Started</th>
                    <th className="px-5 py-3 text-right font-mono font-normal">Duration</th>
                    <th className="px-5 py-3 text-right font-mono font-normal">Guests</th>
                    <th className="px-5 py-3 text-center font-mono font-normal">Status</th>
                    <th className="px-5 py-3 text-right font-mono font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    const live = session.status === 'active' || !session.ended_at
                    return (
                      <tr key={session.id} className="border-b border-slate-800/50 transition-colors hover:bg-slate-900/45">
                        <td className="px-5 py-4">
                          <div className="max-w-[220px] truncate font-mono text-sm text-slate-200">{session.session_name || 'Unnamed session'}</div>
                          <div className="mt-1 font-mono text-[10px] text-slate-600">{session.id}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-400">{formatDate(session.started_at)}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-slate-300">{live ? 'Live' : formatDuration(sessionDuration(session))}</td>
                        <td className="px-5 py-4 text-right font-mono text-slate-300">{session.peak_guests ?? 0}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${live ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>
                            {live ? 'Live' : 'Ended'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {session.recording_url && isBusiness && <ActionButton onClick={() => openRecording(session.id)}>Recording</ActionButton>}
                            <ActionButton onClick={() => downloadAudit(session.id)}>Audit</ActionButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!isFree && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <ActionButton onClick={() => fetchData(page - 1)} disabled={page === 0}>Previous</ActionButton>
            <span className="text-xs font-mono text-slate-500">Page {page + 1} of {totalPages}</span>
            <ActionButton onClick={() => fetchData(page + 1)} disabled={page >= totalPages - 1}>Next</ActionButton>
          </div>
        )}
      </main>
    </div>
  )
}
