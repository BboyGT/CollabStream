import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { resolveJoinCode } from '../lib/session.js'
import CreatorSignature from '../components/CreatorSignature.jsx'

export default function JoinPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [guestName, setGuestName] = useState(() => localStorage.getItem('cs_name') || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cleanCode = String(code || '').trim()

  useEffect(() => {
    if (guestName.trim()) handleJoin(guestName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanCode])

  async function handleJoin(nameOverride) {
    const name = String(nameOverride ?? guestName ?? '').trim()
    if (!cleanCode) {
      setError('Join code is missing.')
      return
    }
    if (!name) {
      setError('Enter your name before joining.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await resolveJoinCode(cleanCode)
      if (!data?.sessionId || !data?.token) {
        setError('This session code is no longer valid.')
        setLoading(false)
        return
      }
      localStorage.setItem('cs_name', name)
      navigate(`/room/${data.sessionId}?token=${encodeURIComponent(data.token)}`, { replace: true })
    } catch {
      setError('Could not join this session. Check the code and try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-zinc-950/80 p-6 shadow-2xl">
        <div className="mx-auto mb-5 w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center shadow-[0_0_22px_rgba(34,211,238,0.35)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
        </div>
        <h1 className="text-slate-100 text-lg font-mono font-semibold mb-2">Join CollabStream</h1>
        <p className="text-slate-500 text-xs font-mono mb-5">Code: <span className="text-cyan-200">{cleanCode || '-'}</span></p>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="Your name or nickname"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500 mb-3"
          autoFocus
        />
        <button
          onClick={() => handleJoin()}
          disabled={loading}
          className="w-full px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-sm font-mono font-semibold transition-all"
        >
          {loading ? 'Joining...' : 'Join session'}
        </button>
        {error && <p className="mt-3 text-red-300 text-xs font-mono">{error}</p>}
        <Link to="/" className="mt-5 inline-block text-slate-500 hover:text-slate-300 text-xs font-mono">
          Back to home
        </Link>
      </div>
      <CreatorSignature />
    </div>
  )
}
