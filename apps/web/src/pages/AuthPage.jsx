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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const passwordChecks = [
    { label: 'At least 10 characters', ok: password.length >= 10 },
    { label: 'Upper and lower case letters', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'At least one number', ok: /\d/.test(password) },
    { label: 'At least one symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const passwordScore = passwordChecks.filter((check) => check.ok).length
  const passwordStrongEnough = passwordScore === passwordChecks.length
  const strengthLabels = ['Very weak', 'Weak', 'Okay', 'Strong', 'Excellent']

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/app')
    })
  }, [navigate])

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (planParam) navigate(`/settings?upgrade=${planParam}`)
    else navigate('/app')
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!passwordStrongEnough) {
      setError('Password must be at least 10 characters and include upper/lowercase letters, a number, and a symbol.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: data.user.email,
        plan: 'free',
      })
    }
    if (data.session) {
      if (planParam) navigate(`/settings?upgrade=${planParam}`)
      else navigate('/app')
    } else {
      setSuccess('Check your email to confirm your account, then sign in.')
      setLoading(false)
    }
  }

  function switchTab(next) {
    setTab(next)
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 safe-area">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center shadow-[0_0_18px_rgba(34,211,238,0.4)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
        </div>
        <span className="font-mono text-lg font-semibold text-slate-100 tracking-widest">CollabStream</span>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex mb-6 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          <button
            onClick={() => switchTab('signin')}
            className={`flex-1 py-2 rounded-lg text-sm font-mono transition-all ${tab === 'signin' ? 'bg-zinc-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Sign in
          </button>
          <button
            onClick={() => switchTab('signup')}
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                placeholder={tab === 'signin' ? 'Password' : '10+ chars, letters, number, symbol'}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-4 pr-16 py-3 text-sm text-slate-200 font-mono outline-none focus:border-cyan-600 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 hover:text-slate-200"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {tab === 'signup' && (
              <div className="mt-2">
                <div className="flex gap-1 mb-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${passwordScore > i ? (passwordScore < 3 ? 'bg-red-500' : passwordScore < 4 ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-zinc-800'}`} />
                  ))}
                </div>
                <div className="text-[11px] font-mono text-slate-500 mb-1">{strengthLabels[passwordScore]}</div>
                <div className="grid gap-1">
                  {passwordChecks.map((check) => (
                    <div key={check.label} className={`text-[11px] font-mono ${check.ok ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {check.ok ? 'OK' : '--'} {check.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-widest">Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-4 pr-16 py-3 text-sm text-slate-200 font-mono outline-none focus:border-cyan-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 hover:text-slate-200"
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
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
            disabled={loading || (tab === 'signup' && !passwordStrongEnough)}
            className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-900 rounded-xl text-sm font-mono font-semibold transition-all"
          >
            {loading ? 'Please wait...' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-mono text-zinc-600">
          Guests don't need an account &mdash;{' '}
          <button onClick={() => navigate('/')} className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
            back to home
          </button>
        </p>
      </div>
    </div>
  )
}
