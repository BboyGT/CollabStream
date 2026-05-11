import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const planParam = searchParams.get('plan')

  const [tab, setTab] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    // If already logged in, redirect to app
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/app')
    })
  }, [navigate])

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Redirect — if plan param present, go to settings to upgrade
    if (planParam) navigate(`/settings?upgrade=${planParam}`)
    else navigate('/app')
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Insert profile row
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email,
        plan: 'free',
      })
    }
    // Supabase sends a confirmation email in production
    if (data.session) {
      if (planParam) navigate(`/settings?upgrade=${planParam}`)
      else navigate('/app')
    } else {
      setSuccess('Check your email to confirm your account, then sign in.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 safe-area">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center shadow-[0_0_18px_rgba(34,211,238,0.4)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
        </div>
        <span className="font-mono text-lg font-semibold text-slate-100 tracking-widest">CollabStream</span>
      </div>

      <div className="w-full max-w-sm">
        {/* Tabs */}
        <div className="flex mb-6 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          <button
            onClick={() => { setTab('signin'); setError(null); setSuccess(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-mono transition-all ${tab === 'signin' ? 'bg-zinc-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Sign in
          </button>
          <button
            onClick={() => { setTab('signup'); setError(null); setSuccess(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-mono transition-all ${tab === 'signup' ? 'bg-zinc-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Create account
          </button>
        </div>

        {planParam && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-cyan-950/50 border border-cyan-800/60 text-cyan-200 text-xs font-mono">
            {tab === 'signup' ? 'Create an account to get started, then upgrade to ' : 'Sign in to upgrade to '}
            <span className="font-semibold capitalize">{planParam}</span>.
          </div>
        )}

        <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-widest">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-200 font-mono outline-none focus:border-cyan-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-widest">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              placeholder={tab === 'signin' ? '••••••••' : 'At least 8 characters'}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-200 font-mono outline-none focus:border-cyan-600 transition-colors"
            />
          </div>

          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-widest">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-slate-200 font-mono outline-none focus:border-cyan-600 transition-colors"
              />
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs font-mono">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-mono">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-900 rounded-xl text-sm font-mono font-semibold transition-all"
          >
            {loading ? 'Please wait\u2026' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-mono text-zinc-600">
          Guests don&apos;t need an account &mdash;{' '}
          <button onClick={() => navigate('/')} className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
            back to home
          </button>
        </p>
      </div>
    </div>
  )
}
