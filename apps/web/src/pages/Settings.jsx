import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getToken, signOut } from '../lib/auth.js'
import { apiUrl } from '../lib/api.js'

const PLAN_LIMITS = {
  free:     { guests: 3,  duration: '45 min', label: 'Free' },
  pro:      { guests: 10, duration: '8 hours', label: 'Pro' },
  // Server-enforced cap is 8 hours for every plan in practice (see
  // apps/server/src/index.js's effectiveDuration calc) — this used to say
  // 'Unlimited' here, which overstated what Business actually gets.
  business: { guests: 20, duration: '8 hours', label: 'Business' },
}

const WEBHOOK_EVENTS = ['session.start', 'session.end', 'guest.join', 'recording.ready']

const PLAN_DETAILS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    position: 'Try CollabStream and host small, quick sessions.',
    features: ['3 guests', '45 minute sessions', 'Live screen share', 'Whiteboard and chat'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$5/mo',
    position: 'Best value for creators, tutors, freelancers, and support calls.',
    features: ['10 guests', '8 hour sessions', 'Local recording', 'Dashboard, audit logs, analytics'],
  },
  {
    id: 'business',
    name: 'Business',
    price: '$15/mo',
    position: 'For teams that need a branded, automated customer workflow.',
    features: ['20 guests', 'Cloud recordings', 'Custom branding', 'Webhooks and saved whiteboards'],
  },
]

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const upgradeParam = searchParams.get('upgrade')

  const [plan, setPlan] = useState('free')
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [accentColor, setAccentColor] = useState('#22d3ee')
  const [logoUrl, setLogoUrl] = useState(null)
  const [brandingSaving, setBrandingSaving] = useState(false)
  const logoInputRef = useRef(null)

  const [webhooks, setWebhooks] = useState([])
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState([...WEBHOOK_EVENTS])
  const [webhookSaving, setWebhookSaving] = useState(false)
  // Delivery log (design idea §3.3): keyed by webhook id, null while never
  // opened, [] while loading/empty, array of delivery rows once fetched.
  const [openDeliveryLog, setOpenDeliveryLog] = useState(null)
  const [deliveries, setDeliveries] = useState({})
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) { navigate('/auth'); return }

      const statusRes = await fetch(apiUrl('/auth/status'), { headers: { Authorization: `Bearer ${token}` } })
      if (!statusRes.ok) { navigate('/auth'); return }
      const { user, plan: p } = await statusRes.json()
      setPlan(p || 'free')
      setUserEmail(user?.email || '')

      if (p === 'business') {
        const brandRes = await fetch(apiUrl('/user/branding'), { headers: { Authorization: `Bearer ${token}` } })
        if (brandRes.ok) {
          const { logoUrl: l, accentColor: a } = await brandRes.json()
          if (l) setLogoUrl(l)
          if (a) setAccentColor(a)
        }
        const hookRes = await fetch(apiUrl('/api/webhooks'), { headers: { Authorization: `Bearer ${token}` } })
        if (hookRes.ok) {
          const { webhooks: w } = await hookRes.json()
          setWebhooks(w || [])
        }
      }

      setLoading(false)

      if (upgradeParam && (upgradeParam === 'pro' || upgradeParam === 'business') && p === 'free') {
        handleUpgrade(upgradeParam === 'business'
          ? import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID
          : import.meta.env.VITE_STRIPE_PRO_PRICE_ID)
      }
    }
    load()
  }, [navigate, upgradeParam])

  async function handleUpgrade(priceId) {
    if (!priceId) { showToast('Stripe price ID not configured.', 'error'); return }
    const token = await getToken()
    const res = await fetch(apiUrl('/billing/checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ priceId }),
    })
    if (!res.ok) { showToast('Could not start checkout.', 'error'); return }
    const { url } = await res.json()
    window.location.href = url
  }

  async function handleManageBilling() {
    const token = await getToken()
    const res = await fetch(apiUrl('/billing/portal'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ returnUrl: `${window.location.origin}/settings` }),
    })
    if (!res.ok) { showToast('Could not open billing portal.', 'error'); return }
    const { url } = await res.json()
    window.location.href = url
  }

  async function saveBranding() {
    setBrandingSaving(true)
    const token = await getToken()
    const form = new FormData()
    form.append('accentColor', accentColor)
    if (logoInputRef.current?.files?.[0]) form.append('logo', logoInputRef.current.files[0])
    const res = await fetch(apiUrl('/user/branding'), { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: form })
    setBrandingSaving(false)
    if (res.ok) {
      const { logoUrl: l, accentColor: a } = await res.json()
      if (l) setLogoUrl(l)
      if (a) { setAccentColor(a); document.documentElement.style.setProperty('--color-accent', a) }
      showToast('Branding saved.')
    } else {
      showToast('Failed to save branding.', 'error')
    }
  }

  async function addWebhook() {
    if (!newWebhookUrl.trim()) return
    setWebhookSaving(true)
    const token = await getToken()
    const res = await fetch(apiUrl('/api/webhooks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: newWebhookUrl.trim(), events: newWebhookEvents }),
    })
    setWebhookSaving(false)
    if (res.ok) {
      const { webhook } = await res.json()
      setWebhooks((w) => [...w, webhook])
      setNewWebhookUrl('')
      showToast('Webhook added.')
    } else {
      showToast('Failed to add webhook.', 'error')
    }
  }

  async function deleteWebhook(id) {
    const token = await getToken()
    await fetch(apiUrl(`/api/webhooks/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setWebhooks((w) => w.filter((h) => h.id !== id))
    showToast('Webhook deleted.')
  }

  // Design idea §3.3: lets a host see recent delivery attempts (status
  // code, timestamp, error) for a webhook without leaving Settings.
  async function toggleDeliveryLog(id) {
    if (openDeliveryLog === id) { setOpenDeliveryLog(null); return }
    setOpenDeliveryLog(id)
    if (deliveries[id]) return
    setDeliveriesLoading(true)
    const token = await getToken()
    const res = await fetch(apiUrl(`/api/webhooks/${id}/deliveries`), { headers: { Authorization: `Bearer ${token}` } })
    setDeliveriesLoading(false)
    if (res.ok) {
      const { deliveries: d } = await res.json()
      setDeliveries((prev) => ({ ...prev, [id]: d || [] }))
    } else {
      setDeliveries((prev) => ({ ...prev, [id]: [] }))
    }
  }

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free
  const isPro = plan === 'pro' || plan === 'business'
  const isBusiness = plan === 'business'

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-slate-500 font-mono text-sm">Loading&hellip;</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200">
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl text-xs font-mono shadow-xl toast-enter ${toast.type === 'error' ? 'bg-red-950 border border-red-800 text-red-200' : 'bg-emerald-950 border border-emerald-800 text-emerald-200'}`}>
          {toast.msg}
        </div>
      )}

      <header className="border-b border-slate-800/70 px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app')} className="flex items-center gap-2.5 text-slate-300 hover:text-slate-100">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="font-mono text-sm font-medium tracking-widest">CollabStream</span>
          </button>
          <span className="text-slate-700">/</span>
          <span className="font-mono text-sm text-slate-400">Settings</span>
        </div>
        <button onClick={async () => { await signOut(); navigate('/') }} className="text-xs font-mono text-slate-400 hover:text-slate-200">Sign out</button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Account */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-mono text-sm font-semibold text-slate-200 mb-4">Account</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-300 text-sm font-mono">{userEmail}</div>
              <div className="text-slate-500 text-xs font-mono mt-0.5">Signed in via Supabase Auth</div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-widest ${isBusiness ? 'bg-amber-950/60 border border-amber-800 text-amber-200' : isPro ? 'bg-cyan-950/60 border border-cyan-800 text-cyan-200' : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
              {limits.label}
            </span>
          </div>
        </div>

        {/* Plan */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-mono text-sm font-semibold text-slate-200 mb-1">Plan</h2>
          <div className="text-xs font-mono text-slate-500 mb-5">
            {limits.label} &mdash; Up to {limits.guests} guests &middot; {limits.duration} sessions
          </div>
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            {PLAN_DETAILS.map((tier) => {
              const active = plan === tier.id
              const canUpgrade = tier.id !== 'free' && plan !== tier.id && !(plan === 'business' && tier.id === 'pro')
              const priceId = tier.id === 'business' ? import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID : import.meta.env.VITE_STRIPE_PRO_PRICE_ID
              return (
                <div key={tier.id} className={`border rounded-xl p-4 ${active ? 'border-cyan-500 bg-cyan-950/10' : tier.id === 'business' ? 'border-amber-800/50 bg-amber-950/10' : 'border-slate-700'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className={`font-mono font-semibold ${tier.id === 'business' ? 'text-amber-200' : 'text-slate-200'}`}>{tier.name}</div>
                      <div className="text-slate-500 text-xs font-mono">{tier.price}</div>
                    </div>
                    {active && <span className="text-[10px] font-mono text-cyan-200 border border-cyan-700 rounded-full px-2 py-0.5">Current</span>}
                  </div>
                  <div className="text-slate-400 text-xs mb-3 min-h-[48px]">{tier.position}</div>
                  <div className="space-y-1.5 mb-4">
                    {tier.features.map((feature) => (
                      <div key={feature} className="text-[11px] font-mono text-slate-300">OK {feature}</div>
                    ))}
                  </div>
                  {canUpgrade && (
                    <button onClick={() => handleUpgrade(priceId)}
                      className={`w-full py-2 rounded-lg text-xs font-mono font-semibold transition-all ${tier.id === 'business' ? 'bg-amber-500 hover:bg-amber-400 text-zinc-900' : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-900'}`}>
                      Upgrade to {tier.name}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {isPro && (
            <button onClick={handleManageBilling}
              className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono transition-colors">
              Manage subscription &rarr;
            </button>
          )}
        </div>

        {/* Branding */}
        <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative ${!isBusiness ? 'overflow-hidden' : ''}`}>
          <h2 className="font-mono text-sm font-semibold text-slate-200 mb-1">Custom branding</h2>
          <div className="text-xs font-mono text-slate-500 mb-5">Logo and accent color applied to your host and guest rooms.</div>
          {!isBusiness && (
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10">
              <div className="text-slate-300 font-mono text-sm mb-3">Business plan required</div>
              <button onClick={() => handleUpgrade(import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-lg text-xs font-mono font-semibold">
                Upgrade to Business
              </button>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-mono text-slate-400 mb-1.5 block uppercase tracking-widest">Logo</label>
              {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 mb-2 rounded" />}
              <input ref={logoInputRef} type="file" accept="image/*" className="text-xs text-slate-400 font-mono" />
            </div>
            <div>
              <label className="text-xs font-mono text-slate-400 mb-1.5 block uppercase tracking-widest">Accent color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-700 bg-transparent" />
                <span className="font-mono text-sm text-slate-300">{accentColor}</span>
              </div>
            </div>
            <button onClick={saveBranding} disabled={brandingSaving || !isBusiness}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-zinc-900 rounded-lg text-xs font-mono font-semibold transition-all">
              {brandingSaving ? 'Saving\u2026' : 'Save branding'}
            </button>
          </div>
        </div>

        {/* Webhooks */}
        <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative ${!isBusiness ? 'overflow-hidden' : ''}`}>
          <h2 className="font-mono text-sm font-semibold text-slate-200 mb-1">Webhooks</h2>
          <div className="text-xs font-mono text-slate-500 mb-5">Receive POST requests when session events occur.</div>
          {!isBusiness && (
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10">
              <div className="text-slate-300 font-mono text-sm mb-3">Business plan required</div>
              <button onClick={() => handleUpgrade(import.meta.env.VITE_STRIPE_BUSINESS_PRICE_ID)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-lg text-xs font-mono font-semibold">
                Upgrade to Business
              </button>
            </div>
          )}
          <div className="space-y-3 mb-5">
            {webhooks.length === 0 && <div className="text-slate-500 font-mono text-xs">No webhooks configured.</div>}
            {webhooks.map((h) => (
              <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-slate-200 text-xs font-mono break-all">{h.url}</div>
                    <div className="text-slate-500 text-[10px] font-mono mt-0.5">{(h.events || []).join(', ')}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button onClick={() => toggleDeliveryLog(h.id)} className="text-slate-400 hover:text-slate-200 text-xs font-mono">
                      {openDeliveryLog === h.id ? 'Hide log' : 'View log'}
                    </button>
                    <button onClick={() => deleteWebhook(h.id)} className="text-red-400 hover:text-red-300 text-xs font-mono">Delete</button>
                  </div>
                </div>
                {openDeliveryLog === h.id && (
                  <div className="border-t border-slate-800 px-4 py-3 bg-slate-950/60">
                    {deliveriesLoading && !deliveries[h.id] ? (
                      <div className="text-slate-500 font-mono text-[11px]">Loading&hellip;</div>
                    ) : !deliveries[h.id]?.length ? (
                      <div className="text-slate-500 font-mono text-[11px]">No deliveries yet. This fills in as events fire.</div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {deliveries[h.id].map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-3 text-[11px] font-mono">
                            <span className="text-slate-500 flex-shrink-0">{d.created_at ? new Date(d.created_at).toLocaleString() : '—'}</span>
                            <span className="text-slate-400 flex-1 truncate">{d.event}</span>
                            <span className={d.ok ? 'text-emerald-400 flex-shrink-0' : 'text-red-400 flex-shrink-0'}>
                              {d.ok ? (d.status_code || 'OK') : (d.status_code || d.error || 'failed')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-mono text-slate-400 mb-1.5 block uppercase tracking-widest">Endpoint URL</label>
              <input value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600" />
            </div>
            <div>
              <label className="text-xs font-mono text-slate-400 mb-1.5 block uppercase tracking-widest">Events</label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={newWebhookEvents.includes(ev)}
                      onChange={(e) => setNewWebhookEvents(e.target.checked ? [...newWebhookEvents, ev] : newWebhookEvents.filter((x) => x !== ev))}
                      className="accent-cyan-500" />
                    <span className="text-xs font-mono text-slate-300">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={addWebhook} disabled={webhookSaving || !newWebhookUrl.trim() || !isBusiness}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-zinc-900 rounded-lg text-xs font-mono font-semibold transition-all">
              {webhookSaving ? 'Adding\u2026' : 'Add webhook'}
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
