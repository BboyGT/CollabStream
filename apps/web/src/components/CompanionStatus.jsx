import { useState } from 'react'
import useSession from '../store/session.js'

export default function CompanionStatus() {
  const { companionConnected } = useSession()
  const [tip, setTip] = useState(false)

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
      <span className={`w-2 h-2 rounded-full transition-colors duration-500 ${
        companionConnected
          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
          : 'bg-amber-400'
      }`} />
      <span className="text-slate-300">
        {companionConnected ? 'Companion connected' : 'Open companion app to enable control'}
      </span>
      {!companionConnected && (
        <button
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
          onFocus={() => setTip(true)}
          onBlur={() => setTip(false)}
          aria-label="Companion app info"
          className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-[9px] font-bold leading-none focus:outline-none hover:text-slate-200"
        >
          ?
        </button>
      )}
      {tip && (
        <div className="absolute bottom-8 right-0 w-56 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 font-mono z-50 shadow-2xl modal-enter leading-relaxed">
          Run the companion app on your desktop to allow guests to control your mouse and keyboard.
        </div>
      )}
    </div>
  )
}
