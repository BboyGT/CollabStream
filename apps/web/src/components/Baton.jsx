import { useEffect, useState } from 'react'

// The "baton" — one shared visual language for "who's currently holding
// something" (the audio floor, or on-screen input control), replacing two
// previously separate, inconsistently-styled UI patterns: a plain-text
// "🎤 X has the floor" banner (cyan pill, emoji icon) and a completely
// differently-styled cyan/red "Hand Control" button in ControlBar.jsx.
// Both now render through this one component. See the redesign prototype
// (collabstream-redesign.html) for the reference design.
//
// `holding` only changes the icon/verb, not the visual shell, so floor-
// holding and control-holding read as the same *kind* of state even though
// they're unrelated features under the hood (see HostRoom.jsx's separate
// floorPeerId vs controlToken/controlPeerId state — this component doesn't
// know or care which one it's representing).
export default function Baton({
  holderName,
  isMe = false,
  holding = 'floor', // 'floor' | 'control'
  size = 'md', // 'md' | 'sm'
  onClick,
  pulse = false, // true right after a handoff, to play the pass animation once
  className = '',
}) {
  const [animating, setAnimating] = useState(false)
  useEffect(() => {
    if (!pulse) return
    setAnimating(true)
    const t = setTimeout(() => setAnimating(false), 500)
    return () => clearTimeout(t)
  }, [pulse])

  const verb = holding === 'floor' ? 'the floor' : 'control'
  const label = isMe ? `You have ${verb}` : `${holderName || 'Someone'} has ${verb}`
  const iconSize = size === 'sm' ? 12 : 14

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full bg-amber-dim border border-amber/35 text-amber font-semibold whitespace-nowrap select-none transition-transform active:scale-95 ${
        size === 'sm' ? 'text-[11px] py-1 pl-1.5 pr-2.5 gap-1.5' : 'text-xs py-1.5 pl-2 pr-3 gap-2'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      <span className={`flex items-center justify-center ${animating ? 'animate-baton-pass' : ''}`}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
      <span className="font-mono font-medium">{label}</span>
    </button>
  )
}

// Small companion action button — "Give floor" / "Give control" — for
// participant-list rows. Same amber pill language as Baton, but an
// explicit action trigger rather than a status display, so it's visually
// obvious the two are related without being the exact same control.
export function BatonActionButton({ label = 'Give floor', onClick, size = 'sm', disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono rounded-full whitespace-nowrap transition-colors ${
        size === 'sm' ? 'text-[10.5px] px-2.5 py-1' : 'text-xs px-3 py-1.5'
      } ${disabled ? 'bg-ink-700 text-ink-dim cursor-not-allowed' : 'bg-amber-dim text-amber hover:bg-amber/20'}`}
    >
      {label}
    </button>
  )
}
