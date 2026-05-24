import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CreatorSignature from '../components/CreatorSignature.jsx'

// ── Intersection Observer hook for scroll animations ─────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible]
}

function Section({ children, className = '', ...props }) {
  const [ref, visible] = useInView()
  return (
    <section ref={ref} className={`section-anim${visible ? ' visible' : ''} ${className}`} {...props}>
      {children}
    </section>
  )
}

// ── Comparison table data ────────────────────────────────────────────────────
const TABLE_ROWS = [
  { feature: 'Screen share', cs: true, zoom: true, meet: true, tv: true },
  { feature: 'Annotation', cs: true, zoom: '⚠ basic', meet: false, tv: false },
  { feature: 'Whiteboard', cs: true, zoom: true, meet: true, tv: false },
  { feature: 'Remote control', cs: true, zoom: false, meet: false, tv: true },
  { feature: 'Guest recording', cs: true, zoom: false, meet: false, tv: false },
  { feature: 'No download required', cs: true, zoom: false, meet: true, tv: false },
  { feature: 'Price', cs: 'Free / $5 / $15', zoom: '$15+/mo', meet: '$6+/mo', tv: '$24+/mo' },
]

function Cell({ v }) {
  if (v === true) return <span className="text-emerald-400 font-bold">✓</span>
  if (v === false) return <span className="text-zinc-600">✗</span>
  return <span className="text-slate-300 text-xs">{v}</span>
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Does my guest need to create an account?', a: 'No. Guests join via a link or QR code with no sign-up required. Only hosts need an account.' },
  { q: 'Does remote control require any software?', a: 'The companion app is optional and enables OS-level mouse and keyboard control. Browser-level control works without any installation.' },
  { q: 'Can I use this on mobile?', a: 'Yes — guests can join from the mobile app on iOS or Android. The host interface is desktop-only.' },
  { q: 'Is my session data stored?', a: 'Only on Pro or Business plans. Free sessions are ephemeral — no data is retained after the session ends.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your Settings page at any time. No questions asked, no cancellation fee.' },
]

function FAQ({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-800 py-4">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between text-left gap-4">
        <span className="text-slate-200 font-mono text-sm">{q}</span>
        <span className="text-slate-500 text-lg flex-shrink-0">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="mt-3 text-slate-400 text-sm leading-relaxed font-light">{a}</p>}
    </div>
  )
}

// ── Pricing card ─────────────────────────────────────────────────────────────
function PricingCard({ name, price, period, features, cta, ctaHref, highlight }) {
  return (
    <div className={`flex flex-col rounded-2xl border p-8 ${highlight ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-slate-800 bg-slate-900/40'}`}>
      {highlight && <div className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest mb-3">Most popular</div>}
      <div className="text-slate-100 font-mono font-semibold text-lg mb-1">{name}</div>
      <div className="text-slate-100 font-mono text-3xl font-bold mb-1">{price}</div>
      {period && <div className="text-slate-500 text-xs font-mono mb-6">{period}</div>}
      <ul className="flex flex-col gap-2 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link to={ctaHref}
        className={`w-full py-3 rounded-xl text-sm font-mono font-semibold text-center transition-all ${highlight ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-900' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}>
        {cta}
      </Link>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-zinc-950 text-slate-200">

      {/* Scroll animation CSS injected once */}
      <style>{`
        .section-anim { opacity: 0; transform: translateY(20px); transition: opacity 0.5s ease, transform 0.5s ease; }
        .section-anim.visible { opacity: 1; transform: translateY(0); }
      `}</style>

      {/* Ambient blobs */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)', top: -200, left: -200 }} />
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)', top: 400, right: -150 }} />
      </div>

      {/* ── STICKY HEADER ── */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur border-b border-slate-800/70">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.35)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="font-mono text-sm font-semibold text-slate-100 tracking-widest">CollabStream</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors">Pricing</a>
            <button onClick={() => navigate('/auth')} className="text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors">Sign in</button>
            <button onClick={() => navigate('/auth')} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-900 rounded-lg text-sm font-mono font-semibold transition-all">
              Get started
            </button>
          </nav>
          <button onClick={() => navigate('/auth')} className="md:hidden px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-900 rounded-lg text-sm font-mono font-semibold">
            Get started
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 text-cyan-200 text-xs font-mono mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Free to start &middot; No credit card
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold text-slate-100 leading-tight mb-6 tracking-tight">
          Screen share, annotate,<br />
          <span className="text-cyan-400">and hand over your mouse.</span>
        </h1>
        <p className="text-slate-400 text-xl leading-relaxed max-w-2xl mx-auto mb-10 font-light">
          The only video collaboration tool where your guest can control your screen — no downloads, no setup.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button onClick={() => navigate('/auth')}
            className="group flex items-center gap-2 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-zinc-900 rounded-xl text-base font-mono font-semibold transition-all shadow-lg shadow-cyan-900/30">
            Start for free
            <svg className="group-hover:translate-x-1 transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <a href="#features"
            className="px-8 py-4 bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 rounded-xl text-base font-mono transition-all">
            See it in action
          </a>
        </div>
      </div>

      {/* ── FEATURE HIGHLIGHTS ── */}
      <Section id="features" className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-100 font-mono mb-3">Everything you need to collaborate</h2>
            <p className="text-slate-400 font-light">Real-time tools that actually work — no plugins, no extensions.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3" /></svg>,
                title: 'Remote control handoff',
                desc: 'Guest takes your mouse. One click. Zero installs. They drive, you watch — or take back control any time.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 17 2-2 4-4-2-2-4 4-2 2h2zm7-9-2-2" /></svg>,
                title: 'Live whiteboard',
                desc: 'Draw, annotate, and write on a shared canvas in real time. Both sides can contribute simultaneously.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 3" /></svg>,
                title: 'Session recording',
                desc: 'Record and download your session as a WebM file. Pro users get cloud storage with a permanent link.',
              },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-900/50 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-slate-100 font-mono font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── COMPARISON TABLE ── */}
      <Section className="relative z-10 py-20 bg-slate-900/20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-100 font-mono mb-3">How we compare</h2>
            <p className="text-slate-400 font-light">The only tool built for real-time collaboration with actual control handoff.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-6 py-4 text-slate-400 font-mono font-normal">Feature</th>
                  <th className="px-6 py-4 text-cyan-300 font-mono font-semibold">CollabStream</th>
                  <th className="px-6 py-4 text-slate-400 font-mono font-normal">Zoom</th>
                  <th className="px-6 py-4 text-slate-400 font-mono font-normal">Google Meet</th>
                  <th className="px-6 py-4 text-slate-400 font-mono font-normal">TeamViewer</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((row, i) => (
                  <tr key={row.feature} className={`border-b border-slate-800/50 ${i % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                    <td className="px-6 py-3 text-slate-300 font-mono text-xs">{row.feature}</td>
                    <td className="px-6 py-3 text-center"><Cell v={row.cs} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.zoom} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.meet} /></td>
                    <td className="px-6 py-3 text-center"><Cell v={row.tv} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── PRICING ── */}
      <Section id="pricing" className="relative z-10 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-100 font-mono mb-3">Simple pricing</h2>
            <p className="text-slate-400 font-light">Start free. Upgrade when you need more.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <PricingCard
              name="Free"
              price="$0"
              period="Forever free"
              features={['Up to 3 guests', '45-minute sessions', 'Screen share & annotation', 'Whiteboard', 'Join by code or QR']}
              cta="Get started free"
              ctaHref="/auth"
            />
            <PricingCard
              name="Pro"
              price="$5"
              period="per month"
              highlight
              features={['Up to 10 guests', '8-hour sessions', 'Local session recording', 'Session history dashboard', 'Priority support']}
              cta="Upgrade to Pro"
              ctaHref="/auth?plan=pro"
            />
            <PricingCard
              name="Business"
              price="$15"
              period="per month"
              features={['Up to 20 guests', '3 host seats', 'Cloud recording (R2)', 'Custom branding & logo', 'Webhooks & integrations', 'Persistent whiteboards']}
              cta="Upgrade to Business"
              ctaHref="/auth?plan=business"
            />
          </div>
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section className="relative z-10 py-20 bg-slate-900/20">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-slate-100 font-mono mb-10 text-center">FAQ</h2>
          {FAQS.map((f) => <FAQ key={f.q} q={f.q} a={f.a} />)}
        </div>
      </Section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-slate-800/70 py-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-cyan-500 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
            </div>
            <span className="text-slate-500 text-xs font-mono">Built by Godstime Aburu</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-slate-500 text-xs font-mono hover:text-slate-300">Privacy</a>
            <a href="/terms" className="text-slate-500 text-xs font-mono hover:text-slate-300">Terms</a>
            <a href="https://github.com/BboyGT" target="_blank" rel="noopener noreferrer" className="text-slate-500 text-xs font-mono hover:text-slate-300">GitHub</a>
          </div>
        </div>
      </footer>

      <CreatorSignature />
    </div>
  )
}
