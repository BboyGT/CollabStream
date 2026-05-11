import { useEffect, useState } from 'react'

export default function OnboardingTips({ role, tips }) {
  const key = `cs_onboard_${role}`
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(key)
    if (!seen) setOpen(true)
  }, [key])

  if (!open) return null

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono z-40 max-w-[90vw]">
      <div className="text-slate-200 mb-2">Quick tips</div>
      <ul className="text-slate-400 space-y-1">
        {tips.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
      <button
        onClick={() => { localStorage.setItem(key, '1'); setOpen(false) }}
        className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-900 text-xs"
      >
        Got it
      </button>
    </div>
  )
}
